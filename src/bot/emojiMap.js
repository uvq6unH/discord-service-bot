/**
 * emojiMap.js — Emoji name → unicode resolver, tách ra khỏi bot.js
 *
 * Module được tách riêng để giảm coupling trong bot.js và dễ maintain.
 * Lưu ý: đây là "module-separated", không phải "lazy-loaded" — EMOJI_MAP
 * vẫn được khởi tạo ngay khi file được import lần đầu. Để lazy thật sự,
 * cần dùng pattern: let map = null; export function getMap() { map ??= {...}; return map; }
 * Ở quy mô hiện tại (~120 entries) không cần thiết.
 *
 * Chỉ import file này khi cần resolveEmojiNames (reminder worker, v.v.)
 */

const EMOJI_MAP = {
  smile: '😊', grinning: '😀', laughing: '😆', joy: '😂', rofl: '🤣',
  wink: '😉', blush: '😊', heart_eyes: '😍', kissing_heart: '😘',
  yum: '😋', sunglasses: '😎', thinking: '🤔', raised_eyebrow: '🤨',
  neutral_face: '😐', expressionless: '😑', unamused: '😒', roll_eyes: '🙄',
  hushed: '😯', astonished: '😲', flushed: '😳', pleading_face: '🥺',
  cry: '😢', sob: '😭', angry: '😠', rage: '😡', skull: '💀',
  ghost: '👻', alien: '👽', robot: '🤖', poop: '💩', clown: '🤡',
  thumbsup: '👍', thumbsdown: '👎', clap: '👏', wave: '👋',
  raised_hands: '🙌', pray: '🙏', muscle: '💪', point_right: '👉',
  point_left: '👈', point_up: '☝️', point_down: '👇', ok_hand: '👌',
  v: '✌️', crossed_fingers: '🤞', metal: '🤘', call_me_hand: '🤙',
  writing_hand: '✍️', open_hands: '👐', handshake: '🤝',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', white_heart: '🤍',
  broken_heart: '💔', sparkling_heart: '💖', heartbeat: '💓', two_hearts: '💕',
  star: '⭐', star2: '🌟', dizzy: '💫', sparkles: '✨', fire: '🔥',
  tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁',
  trophy: '🏆', medal: '🥇', first_place: '🥇', second_place: '🥈', third_place: '🥉',
  bell: '🔔', no_bell: '🔕', alarm_clock: '⏰', stopwatch: '⏱️',
  calendar: '📅', date: '📅', spiral_calendar: '🗓️',
  memo: '📝', pencil: '✏️', pencil2: '✏️', pen: '🖊️',
  email: '📧', envelope: '✉️', mailbox: '📬', inbox_tray: '📥',
  outbox_tray: '📤', telephone: '☎️', iphone: '📱', computer: '💻',
  desktop_computer: '🖥️', printer: '🖨️', keyboard: '⌨️',
  mag: '🔍', mag_large: '🔎', lock: '🔒', unlock: '🔓', key: '🔑',
  warning: '⚠️', stop_sign: '🛑', no_entry: '⛔', x: '❌', white_check_mark: '✅',
  ballot_box_with_check: '☑️', heavy_check_mark: '✔️', heavy_plus_sign: '➕',
  heavy_minus_sign: '➖', question: '❓', grey_question: '❔',
  exclamation: '❗', grey_exclamation: '❕', bangbang: '‼️',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️',
  repeat: '🔁', repeat_one: '🔂', arrows_counterclockwise: '🔄',
  information_source: 'ℹ️', new: '🆕', up: '🆙', cool: '🆒', free: '🆓',
  sos: '🆘', ok: '🆗', ng: '🆖', id: '🆔',
  sun: '☀️', moon: '🌙', cloud: '☁️', snowflake: '❄️', umbrella: '☂️',
  rainbow: '🌈', zap: '⚡', ocean: '🌊', earth_asia: '🌏',
  cat: '🐱', dog: '🐶', fox_face: '🦊', bear: '🐻', panda_face: '🐼',
  pizza: '🍕', hamburger: '🍔', fries: '🍟', sushi: '🍣', ramen: '🍜',
  cake: '🎂', coffee: '☕', tea: '🍵', beer: '🍺', wine_glass: '🍷',
  soccer: '⚽', basketball: '🏀', football: '🏈', tennis: '🎾', golf: '⛳',
  video_game: '🎮', joystick: '🕹️', dice: '🎲', chess_pawn: '♟️',
  musical_note: '🎵', notes: '🎶', microphone: '🎤', headphones: '🎧',
  guitar: '🎸', drum: '🥁', trumpet: '🎺', violin: '🎻',
  house: '🏠', office: '🏢', school: '🏫', hospital: '🏥',
  car: '🚗', bus: '🚌', train: '🚆', airplane: '✈️', rocket: '🚀',
  moneybag: '💰', dollar: '💵', euro: '💶', gem: '💎',
  100: '💯', infinity: '♾️', recycle: '♻️', white_flag: '🏳️', crossed_flags: '🎌',
};

/**
 * Thay thế :emoji_name: tokens bằng unicode hoặc custom emoji.
 * Guild custom emoji được ưu tiên; fallback về EMOJI_MAP.
 * Tên không tìm thấy giữ nguyên (ví dụ: :lui2: không thay).
 *
 * @param {string|null} text
 * @param {import('discord.js').Guild|null} guild
 * @returns {string|null}
 */
export function resolveEmojiNames(text, guild = null) {
  if (!text) return text;
  return text.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
    if (guild) {
      const custom = guild.emojis.cache.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      if (custom) return custom.toString();
    }
    return EMOJI_MAP[name] ?? match;
  });
}
