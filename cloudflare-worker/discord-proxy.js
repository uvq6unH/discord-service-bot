/**
 * Cloudflare Worker: Discord API Reverse Proxy
 *
 * Tác dụng: Chuyển tiếp request từ Render sang Discord API thông qua hạ tầng Cloudflare Edge.
 * Giúp vượt qua 100% lỗi Discord rate limit IP datacenter (HTTP 429 code 0) trên Render.
 *
 * Hướng dẫn triển khai miễn phí (1 phút):
 * 1. Đăng nhập https://dash.cloudflare.com/ -> Chọn "Workers & Pages" -> "Create application" -> "Create Worker".
 * 2. Đặt tên worker (ví dụ: discord-api-proxy) -> bấm "Deploy".
 * 3. Bấm "Edit code", dán toàn bộ nội dung file này vào -> bấm "Deploy".
 * 4. Copy URL của worker: https://<worker-name>.<subdomain>.workers.dev
 * 5. Trên Render Dashboard (cho cả web service dashboard và bot):
 *    Thêm biến môi trường (Environment Variable):
 *    DISCORD_API_BASE_URL = https://<worker-name>.<subdomain>.workers.dev/api/v10
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Health / Diag probe (không proxy, chỉ báo trạng thái worker)
    if (url.pathname === '/health' || url.pathname === '/diag' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        proxy: 'discord-service-bot-proxy',
        authConfigured: Boolean(env?.PROXY_SECRET),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fail-Closed Authentication:
    // Bắt buộc PROXY_SECRET phải được cấu hình trong env VÀ request header x-proxy-secret phải khớp.
    const expectedSecret = env?.PROXY_SECRET;
    const providedSecret = request.headers.get('x-proxy-secret');
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: proxy secret missing or invalid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Chuẩn hóa pathname: Thêm /api/v10 nếu caller chỉ truyền path ngắn
    let pathname = url.pathname;
    if (!pathname.startsWith('/api')) {
      pathname = `/api/v10${pathname}`;
    }

    // 3. Strict Method & Route Whitelisting (v10 only):
    // Chỉ cho phép đúng các endpoint OAuth2 và Users/Guilds cần thiết cho bot/dashboard.
    const method = request.method.toUpperCase();
    const isTokenExchange = method === 'POST' && pathname === '/api/v10/oauth2/token';
    const isUserMe = method === 'GET' && pathname === '/api/v10/users/@me';
    const isUserGuilds = method === 'GET' && pathname === '/api/v10/users/@me/guilds';

    if (!isTokenExchange && !isUserMe && !isUserGuilds) {
      return new Response(JSON.stringify({
        error: `Forbidden: Method '${method}' on path '${pathname}' is not permitted through proxy`,
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Chuyển tiếp toàn bộ path và query sang discord.com
    const targetUrl = new URL(pathname + url.search, 'https://discord.com');

    // Clone headers và ghi đè Host header sang discord.com
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'discord.com');

    // Bắt buộc xoá header xác thực bí mật và các header IP client
    newHeaders.delete('x-proxy-secret');
    newHeaders.delete('cf-connecting-ip');
    newHeaders.delete('x-forwarded-for');
    newHeaders.delete('x-real-ip');

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow',
    });

    return response;
  },
};
