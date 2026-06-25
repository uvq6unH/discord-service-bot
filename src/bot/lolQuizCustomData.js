/**
 * static datasets for web-based custom LoL quiz modes
 */

export const CONNECTIONS_CATEGORIES = [
  {
    name: "Tướng tộc Yordle",
    difficulty: "easy", // green
    champions: ["Teemo", "Lulu", "Tristana", "Veigar"]
  },
  {
    name: "Sử dụng Nội năng (Energy)",
    difficulty: "medium", // blue
    champions: ["Zed", "Shen", "Kennen", "Akali"]
  },
  {
    name: "Vũ khí chính là Cung",
    difficulty: "medium", // blue
    champions: ["Ashe", "Varus", "Vayne", "Kindred"]
  },
  {
    name: "Có kỹ năng tàng hình",
    difficulty: "hard", // purple
    champions: ["Twitch", "Shaco", "Evelynn", "Pyke"]
  },
  {
    name: "Chiêu cuối ảnh hưởng toàn bản đồ",
    difficulty: "hard", // purple
    champions: ["Karthus", "Soraka", "Ezreal", "Jinx"]
  },
  {
    name: "Có cơ chế tự hồi sinh / tạo hộ thể sinh mệnh",
    difficulty: "expert", // yellow/gold
    champions: ["Anivia", "Zac", "Zilean", "Aatrox"]
  },
  {
    name: "Đến từ Đảo Bóng Đêm",
    difficulty: "easy", // green
    champions: ["Hecarim", "Thresh", "Kalista", "Gwen"]
  },
  {
    name: "Tướng vùng đất Shurima",
    difficulty: "easy", // green
    champions: ["Azir", "Nasus", "Renekton", "Xerath"]
  },
  {
    name: "Đến từ Freljord băng giá",
    difficulty: "easy", // green
    champions: ["Sejuani", "Olaf", "Braum", "Tryndamere"]
  },
  {
    name: "Sát thủ vật lý đường giữa / đi rừng",
    difficulty: "medium", // blue
    champions: ["Talon", "KhaZix", "Rengar", "Kayn"]
  },
  {
    name: "Đấu sĩ Đỡ đòn đường trên",
    difficulty: "medium", // blue
    champions: ["Darius", "Riven", "Sett", "Gnar"]
  },
  {
    name: "Quái vật đến từ Hư Không",
    difficulty: "hard", // purple
    champions: ["ChoGath", "RekSai", "KogMaw", "VelKoz"]
  }
];

export const BUILD_PRESETS = [
  {
    champion: "Yasuo",
    rune: "Nhịp Độ Chết Người (Precision)",
    skillOrder: "Max Q -> E -> W",
    coreItems: ["Giày Cuồng Nộ (Berserker's Greaves)", "Nỏ Tử Thủ (Immortal Shieldbow)", "Vô Cực Kiếm (Infinity Edge)", "Đao Tím (Wit's End)", "Vũ Điệu Tử Thần (Death's Dance)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Yasuo", "Yone", "Tryndamere", "Master Yi", "Fiora"],
    hints: [
      "Ngọc bổ trợ phụ: Đắc Thắng - Thường xuyên",
      "Kỹ năng: Khởi đầu Q - Luôn luôn",
      "Kỹ năng: Nâng tối đa E thứ hai - Thường xuyên",
      "Ngọc siêu cấp khác: Bước Chân Thần Tốc - Thỉnh thoảng",
      "Vị trí thi đấu chính: Đường giữa hoặc Đường dưới"
    ]
  },
  {
    champion: "Jhin",
    rune: "Bước Chân Thần Tốc (Precision)",
    skillOrder: "Max Q -> W -> E",
    coreItems: ["Giày Bạc (Boots of Swiftness)", "Súng Hải Tặc (The Collector)", "Vô Cực Kiếm (Infinity Edge)", "Đại Bác Liên Thanh (Rapid Firecannon)", "Nỏ Thần Dominik (Lord Dominik's Regards)", "Huyết Kiếm (Bloodthirster)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Jhin", "Caitlyn", "Ashe", "Draven", "Miss Fortune"],
    hints: [
      "Kỹ năng: Khởi đầu Q - Luôn luôn",
      "Tốc độ đánh: Tự động chuyển đổi thành Sức mạnh Công kích - 特征 tướng",
      "Đòn đánh thường: Phát bắn thứ tư luôn chí mạng - 特征 tướng",
      "Ngọc siêu cấp: Sốc Điện - Hầu như không bao giờ",
      "Phép bổ trợ phổ biến: Tốc Biến + Hồi Máu/Thanh Tẩy"
    ]
  },
  {
    champion: "Caitlyn",
    rune: "Bước Chân Thần Tốc (Precision)",
    skillOrder: "Max Q -> W -> E",
    coreItems: ["Giày Cuồng Nộ (Berserker's Greaves)", "Móc Diệt Thủy Quái (Kraken Slayer)", "Vô Cực Kiếm (Infinity Edge)", "Đại Bác Liên Thanh (Rapid Firecannon)", "Nỏ Thần Dominik (Lord Dominik's Regards)", "Huyết Kiếm (Bloodthirster)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Jhin", "Caitlyn", "Ashe", "Draven", "Jinx"],
    hints: [
      "Kỹ năng: Khởi đầu Q - Thường xuyên (Đôi khi nâng W trước để bẫy)",
      "Tầm đánh cơ bản: 650 (Thuộc hàng cao nhất game) - 特征 tướng",
      "Kỹ năng: Chiêu W là Bẫy Hẹn Giờ - 特征 tướng",
      "Ngọc siêu cấp khác: Đòn Phủ Đầu - Thỉnh thoảng (Lối lên Sát lực)",
      "Ngọc siêu cấp: Mưa Kiếm - Hầu như không bao giờ"
    ]
  },
  {
    champion: "Ashe",
    rune: "Nhịp Độ Chết Người (Precision)",
    skillOrder: "Max W -> Q -> E",
    coreItems: ["Giày Cuồng Nộ (Berserker's Greaves)", "Móc Diệt Thủy Quái (Kraken Slayer)", "Cuồng Cung Runaan (Runaan's Hurricane)", "Gươm Suy Vong (Blade of the Ruined King)", "Nỏ Thần Dominik (Lord Dominik's Regards)", "Đao Tím (Wit's End)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Jhin", "Caitlyn", "Ashe", "Draven", "Varus"],
    hints: [
      "Kỹ năng: Khởi đầu W (Tán Xạ Tiễn) - Luôn luôn",
      "Đòn đánh thường: Gây hiệu ứng làm chậm Băng Giá - 特征 tướng",
      "Kỹ năng: Chiêu E giúp soi sáng bản đồ (Ưng Tiễn) - 特征 tướng",
      "Ngọc bổ trợ phụ: Nhát Chém Ân Huệ - Thường xuyên",
      "Chiêu cuối: Mũi Tên Xuyên Phá làm choáng toàn bản đồ - 特征 tướng"
    ]
  },
  {
    champion: "Draven",
    rune: "Chinh Phục (Precision)",
    skillOrder: "Max Q -> W -> E",
    coreItems: ["Giày Cuồng Nộ (Berserker's Greaves)", "Huyết Kiếm (Bloodthirster)", "Vô Cực Kiếm (Infinity Edge)", "Súng Hải Tặc (The Collector)", "Nỏ Thần Dominik (Lord Dominik's Regards)", "Nỏ Tử Thủ (Immortal Shieldbow)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Jhin", "Caitlyn", "Ashe", "Draven", "Lucian"],
    hints: [
      "Kỹ năng: Khởi đầu Q (Rìu Xoay) - Luôn luôn",
      "Cơ chế: Nhặt rìu để hồi chiêu W và tích điểm ngưỡng mộ - 特征 tướng",
      "Nội tại: Nhận thêm rất nhiều Vàng khi hạ gục tướng địch - 特征 tướng",
      "Ngọc siêu cấp khác: Mưa Kiếm / Thu Hoạch Hắc Ám - Đôi khi",
      "Ngọc bổ trợ phụ: Hiện Diện Trí Tuệ - Thường xuyên"
    ]
  },
  {
    champion: "Zed",
    rune: "Sốc Điện (Domination)",
    skillOrder: "Max Q -> E -> W",
    coreItems: ["Giày Khai Sáng Ionia (Ionian Boots of Lucidity)", "Nguyệt Đao (Eclipse)", "Rìu Mãng Xà (Ravenous Hydra)", "Áo Choàng Bóng Tối (Edge of Night)", "Thương Phục Hận Serylda (Serylda's Grudge)", "Kiếm Ma Youmuu (Youmuu's Ghostblade)"],
    recommendations: ["Zed", "Talon", "Kayn", "KhaZix", "Pyke"],
    hints: [
      "Kỹ năng: Khởi đầu Q (Phi Tiêu Sắc Lẻm) - Luôn luôn",
      "Kỹ năng: Nâng W cấp 1 - Hầu như không bao giờ",
      "Tài nguyên sử dụng: Nội năng (Energy)",
      "Chiêu cuối: Khắc dấu ấn tử thần lên mục tiêu - 特征 tướng",
      "Vị trí thi đấu chính: Đường giữa"
    ]
  },
  {
    champion: "Lee Sin",
    rune: "Chinh Phục (Precision)",
    skillOrder: "Max Q -> W -> E",
    coreItems: ["Giày Thép Gai (Plated Steelcaps)", "Chùy Hấp Huyết (Goredrinker)", "Rìu Đen (Black Cleaver)", "Móng Vuốt Sterak (Sterak's Gage)", "Vũ Điệu Tử Thần (Death's Dance)", "Giáp Thiên Thần (Guardian Angel)"],
    recommendations: ["Lee Sin", "Jarvan IV", "Xin Zhao", "Hecarim", "Vi"],
    hints: [
      "Kỹ năng: Khởi đầu W (Hộ Thể) - Đôi khi (khi cần dọn rừng an toàn/ăn bãi đầu)",
      "Kỹ năng: Mỗi chiêu thức đều có kích hoạt lần 2 - 特征 tướng",
      "Tài nguyên sử dụng: Nội năng (Energy)",
      "Ngọc siêu cấp: Thu Thập Hắc Ám - Hiếm khi",
      "Vị trí thi đấu chính: Đi rừng"
    ]
  },
  {
    champion: "Lux",
    rune: "Thiên Thạch Bí Ẩn (Sorcery)",
    skillOrder: "Max E -> Q -> W",
    coreItems: ["Giày Pháp Sư (Sorcerer's Shoes)", "Bão Tố Luden (Luden's Tempest)", "Kính Nhắm Vũ Trụ (Horizon Focus)", "Mũ Phù Thủy Rabadon (Rabadon's Deathcap)", "Trượng Hư Vô (Void Staff)", "Đồng Hồ Cát Zhonya (Zhonya's Hourglass)"],
    recommendations: ["Lux", "Xerath", "Ziggs", "Ahri", "Morgana"],
    hints: [
      "Kỹ năng: Khởi đầu E (Quả Cầu Ánh Sáng) - Luôn luôn",
      "Kỹ năng: Khởi đầu W (Lăng Kính Phòng Ngự) - Hiếm khi (chỉ khi bị cướp rừng cần giáp sớm)",
      "Tầm chiêu cuối: Cực xa (Cầu Cầu Ánh Sáng) - 特征 tướng",
      "Vị trí thi đấu phụ: Hỗ trợ",
      "Ngọc siêu cấp: Quyền Năng Bất Diệt - Hầu như không bao giờ"
    ]
  },
  {
    champion: "Aatrox",
    rune: "Chinh Phục (Precision)",
    skillOrder: "Max Q -> E -> W",
    coreItems: ["Giày Thép Gai (Plated Steelcaps)", "Nguyệt Đao (Eclipse)", "Rìu Đen (Black Cleaver)", "Móng Vuốt Sterak (Sterak's Gage)", "Vũ Điệu Tử Thần (Death's Dance)", "Giáp Tâm Linh (Spirit Visage)"],
    recommendations: ["Aatrox", "Riven", "Jax", "Fiora", "Renekton"],
    hints: [
      "Kỹ năng: Khởi đầu Q (Quỷ Kiếm Darkin) - Luôn luôn",
      "Kỹ năng: Nâng E cấp 2 - Thường xuyên",
      "Ngọc bổ trợ phụ: Chốt Chặn Cuối Cùng - Thường xuyên",
      "Khả năng hồi phục: Nhận rất nhiều hút máu toàn phần khi bật chiêu cuối - 特征 tướng",
      "Tài nguyên sử dụng: Không dùng tài nguyên"
    ]
  },
  {
    champion: "Alistar",
    rune: "Dư Chấn (Resolve)",
    skillOrder: "Max Q -> W -> E",
    coreItems: ["Giày Cơ Động (Mobility Boots)", "Dây Chuyền Locket Sắt Solari (Locket of the Iron Solari)", "Lời Thề Hiệp Sĩ (Knight's Vow)", "Tụ Bão Zeke (Zeke's Convergence)", "Tim Băng (Frozen Heart)", "Giáp Gai (Thornmail)"],
    recommendations: ["Alistar", "Leona", "Nautilus", "Thresh", "Blitzcrank"],
    hints: [
      "Kỹ năng: Khởi đầu Q (Nện Đất) - Thường xuyên (khi bảo vệ/xâm lăng cấp 1)",
      "Combo nổi tiếng: Combo W + Q (Bò Húc + Nện Đất) - 特征 tướng",
      "Ngọc siêu cấp: Chinh Phục / Nhịp Độ Chết Người - Hầu như không bao giờ",
      "Chiêu cuối: Loại bỏ mọi hiệu ứng khống chế và giảm rất nhiều sát thương nhận vào - 特征 tướng",
      "Vị trí thi đấu chính: Hỗ trợ"
    ]
  }
];

export function generateConnectionsGame(categories = CONNECTIONS_CATEGORIES) {
  const shuffled = [...categories].sort(() => 0.5 - Math.random());
  const selected = [];
  const usedChamps = new Set();

  for (const cat of shuffled) {
    const hasOverlap = cat.champions.some(c => usedChamps.has(c));
    if (!hasOverlap) {
      selected.push(cat);
      cat.champions.forEach(c => usedChamps.add(c));
      if (selected.length === 4) break;
    }
  }

  if (selected.length < 4) {
    // Fallback
    return shuffled.slice(0, 4);
  }
  return selected;
}
