import { rate, Rating, Options } from "openskill";

const ORDINAL_SCALING = 25;
const ORDINAL_OFFSET = 1100;
const TAU = 0.3;

const SLIPPI_API = "https://internal.slippi.gg/";

const slippiOrdinal = (r: Rating): number =>
  ORDINAL_SCALING * (r.mu - 3 * r.sigma) + ORDINAL_OFFSET;

const options: Options = {
  tau: TAU,
  mu: 25,
  sigma: 25 / 3,
  limitSigma: true,
  preventSigmaIncrease: true,
};

export function getRank(rating: number, regionalPlacement?: number, globalPlacement?: number): string {
  switch (true) {
    case rating < 766:
      return 'BRONZE 1';
    case rating < 914:
      return 'BRONZE 2';
    case rating < 1055:
      return 'BRONZE 3';
    case rating < 1189:
      return 'SILVER 1';
    case rating < 1316:
      return 'SILVER 2';
    case rating < 1436:
      return 'SILVER 3';
    case rating < 1549:
      return 'GOLD 1';
    case rating < 1654:
      return 'GOLD 2';
    case rating < 1752:
      return 'GOLD 3';
    case rating < 1843:
      return 'PLATINUM 1';
    case rating < 1928:
      return 'PLATINUM 2';
    case rating < 2004:
      return 'PLATINUM 3';
    case rating < 2074:
      return 'DIAMOND 1';
    case rating < 2137:
      return 'DIAMOND 2';
    case rating < 2192:
      return 'DIAMOND 3';
    case rating >= 2192 && (Boolean(regionalPlacement && regionalPlacement <= 100) || Boolean(globalPlacement && globalPlacement <= 300)):
      return 'GRANDMASTER';
    case rating < 2275:
      return 'MASTER 1';
    case rating < 2350:
      return 'MASTER 2';
    case rating >= 2350:
      return 'MASTER 3';
    default:
      return 'UNRANKED';
  }
}

export async function fetchSlippiProfile(code: string) {
  const tag = code.toUpperCase();
  console.log(`[Slippi] Fetching profile for: ${tag}`);

  const query = `
    fragment profileFields on NetplayProfile {
      id
      ratingMu
      ratingSigma
      ratingOrdinal
      ratingUpdateCount
      wins
      losses
      dailyGlobalPlacement
      dailyRegionalPlacement
      continent
      characters {
        character
        gameCount
      }
    }

    fragment userProfilePage on User {
      fbUid
      displayName
      connectCode {
        code
      }
      status
      activeSubscription {
        level
        hasGiftSub
      }
      rankedNetplayProfile {
        ...profileFields
      }
    }

    query UserProfilePageQuery($cc: String, $uid: String) {
      getUser(fbUid: $uid, connectCode: $cc) {
        ...userProfilePage
      }
    }
  `;

  const res = await fetch(SLIPPI_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "UserProfilePageQuery",
      query,
      variables: { cc: tag, uid: tag },
    }),
  });

  const text = await res.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error(`[Slippi] Failed to parse JSON for ${tag}`);
    console.error(text.slice(0, 500));
    throw new Error("Failed to parse Slippi response");
  }

  const user = json?.data?.getUser;
  if (!user || !user.rankedNetplayProfile) {
    console.warn(`[Slippi] No ranked profile for ${tag}. Full response:`, JSON.stringify(json, null, 2));
    throw new Error(`Ranked profile not found for ${tag}`);
  }

  const profile = user.rankedNetplayProfile;

  console.log(`[Slippi] Profile for ${user.displayName}: ${profile.ratingOrdinal.toFixed(1)} ordinal`);

  return {
    mu: profile.ratingMu,
    sigma: profile.ratingSigma,
    ordinal: profile.ratingOrdinal,
    name: user.displayName,
    regionalPlacement: profile.dailyRegionalPlacement,
    globalPlacement: profile.dailyGlobalPlacement,
    wins: profile.wins,
    losses: profile.losses,
    characters: profile.characters.map(c => c.character),
  };
}

export async function predictChange(opponentCode: string, playerCode: string = "LILB#864") {
  const [player, opponent] = await Promise.all([
    fetchSlippiProfile(playerCode),
    fetchSlippiProfile(opponentCode),
  ]);

  const [[win]] = rate(
    [[{ mu: player.mu, sigma: player.sigma }], [{ mu: opponent.mu, sigma: opponent.sigma }]],
    options
  );
  const [, [loss]] = rate(
    [[{ mu: opponent.mu, sigma: opponent.sigma }], [{ mu: player.mu, sigma: player.sigma }]],
    options
  );

  const currentOrdinal = player.ordinal;
  const winOrdinal = slippiOrdinal(win);
  const lossOrdinal = slippiOrdinal(loss);

  const currentRank = getRank(currentOrdinal, player.regionalPlacement, player.globalPlacement);
  const winRank = getRank(winOrdinal, player.regionalPlacement, player.globalPlacement);
  const lossRank = getRank(lossOrdinal, player.regionalPlacement, player.globalPlacement);

  const deltaWin = winOrdinal - currentOrdinal;
  const deltaLoss = lossOrdinal - currentOrdinal;

  const opponentRank = getRank(opponent.ordinal, opponent.regionalPlacement, opponent.globalPlacement);
  const opponentRankEmojiName = opponentRank.replace(' ', '');

  return {
    opponent: opponent.name,
    opponentOrdinal: opponent.ordinal,
    opponentRank,
    opponentRankEmojiName,
    player: player.name,
    playerOrdinal: player.ordinal,
    deltaWin,
    deltaLoss,
    currentRank,
    winRank,
    lossRank,
    currentRankEmojiName: currentRank.replace(' ', ''),
    winRankEmojiName: winRank.replace(' ', ''),
    lossRankEmojiName: lossRank.replace(' ', '')
  };
}
