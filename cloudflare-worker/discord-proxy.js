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

    // Tự động thêm /api/v10 nếu caller chỉ truyền domain mà không có /api
    let pathname = url.pathname;
    if (!pathname.startsWith('/api')) {
      pathname = `/api/v10${pathname}`;
    }

    // Chuyển tiếp toàn bộ path và query sang discord.com
    const targetUrl = new URL(pathname + url.search, 'https://discord.com');

    // Clone headers và ghi đè Host header sang discord.com
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'discord.com');

    // Xoá các header IP của client cũ để tránh bị Cloudflare phạt nhầm theo IP nguồn
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
