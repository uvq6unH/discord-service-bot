import { memberRepository } from './member.repository.js';

export const memberService = {
  fetchMembers: async (guildId, page, search) => {
    const data = await memberRepository.getMembers(guildId, page, search);
    return {
      members: data?.members ?? [],
      total: data?.total ?? 0,
      pageCount: Math.ceil((data?.total ?? 0) / 20)
    };
  }
};
