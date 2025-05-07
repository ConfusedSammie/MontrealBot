import fetch from 'node-fetch';
import { TextChannel, ThreadChannel, EmbedBuilder } from 'discord.js';
import { escapeMarkdown } from './utils.js';
import { activeEventIntervals } from './state.js';
import dotenv from 'dotenv';
dotenv.config();

const apiUrl = process.env.STARTGG_API_URL!;
const bearerToken = process.env.STARTGG_BEARER!;

const tourneyResultQuery = `
query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    state
    sets(page: $page, perPage: $perPage, sortType: RECENT) {
      nodes {
        id
        state
        fullRoundText
        phaseGroup {
          displayIdentifier
          phase {
            name
          }
        }
        displayScore
        slots {
          entrant {
            id
            name
          }
        }
      }
    }
  }
}`;

type Entrant = {
  id: string;
  name: string;
};

type Slot = {
  entrant?: Entrant;
};

type SetNode = {
  id: string;
  state: number;
  fullRoundText?: string;
  phaseGroup?: {
    displayIdentifier?: string;
    phase?: {
      name?: string;
    };
  };
  displayScore?: string;
  slots: Slot[];
};

interface GraphQLResponse {
  data: {
    event: {
      state: string;
      sets: {
        nodes: SetNode[];
      };
    };
  };
  errors?: any;
}

const processedSetIds = new Set<string>();
let lastMessage: any = null;

export async function fetchGraphQL1(eventId: number, channel: TextChannel | ThreadChannel): Promise<void> {
  console.log(eventId);
  let allSets: SetNode[] = [];
  let eventState: string | null = null;
  let page = 1;

  while (true) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`
      },
      body: JSON.stringify({
        query: tourneyResultQuery,
        variables: { eventId, page, perPage: 20 }
      })
    });

    const result = await response.json() as GraphQLResponse;

    if (!response.ok || result.errors) {
      console.error("GraphQL Error:", result.errors);
      break;
    }

    if (eventState === null) {
      eventState = result?.data?.event?.state || null;
      console.log(`Event state: ${eventState}`);
    }

    const sets = result.data.event.sets.nodes;
    if (!sets || sets.length === 0) break;

    allSets.push(...sets);
    page++;
  }

  if (eventState === "COMPLETED") {
    console.log(`Event ${eventId} is marked as COMPLETED. Stopping tracking.`);

    const key = `${channel.id}:${eventId}`;
    if (activeEventIntervals.has(key)) {
      clearInterval(activeEventIntervals.get(key));
      activeEventIntervals.delete(key);
    }

    await channel.send(`✅ Event has ended. Final results shown. Tracking for event ID ${eventId} has stopped.`);
  }

  const newCompletedSets = allSets.filter(set => set.state === 3 && !processedSetIds.has(set.id));
  if (!newCompletedSets.length) return;

  const phaseGroups: Record<string, Record<string, string[]>> = {};

  newCompletedSets.forEach(set => {
    processedSetIds.add(set.id);

    const slot1 = set.slots?.[0]?.entrant;
    const slot2 = set.slots?.[1]?.entrant;
    const player1 = escapeMarkdown(slot1?.name?.split('|').pop()?.trim() || 'Unknown');
    const player2 = escapeMarkdown(slot2?.name?.split('|').pop()?.trim() || 'Unknown');

    const [p1ScoreRaw, p2ScoreRaw] = set.displayScore?.split(' - ') || ['0', '0'];
    const p1Name = slot1?.name || '';
    const p2Name = slot2?.name || '';

    let scoreDisplay: string;
    let player1Score: number | null = null;
    let player2Score: number | null = null;

    if (!p1ScoreRaw || !p2ScoreRaw) {
      return; // Skip DQs
    }

    player1Score = parseInt(p1ScoreRaw.replace(p1Name, '').trim()) || 0;
    player2Score = parseInt(p2ScoreRaw.replace(p2Name, '').trim()) || 0;
    scoreDisplay = `${player1} ${player1Score} - ${player2Score} ${player2}`;

    const phase = set.phaseGroup?.phase?.name || "Unknown Phase";
    const pool = set.phaseGroup?.displayIdentifier || "Unknown Pool";
    const round = set.fullRoundText || "Unknown Round";

    const showRound = /^(Winners|Losers|Grand)/i.test(round) ? `**${round}** | ` : '';
    const line = `${showRound}${scoreDisplay}`;

    if (!phaseGroups[phase]) phaseGroups[phase] = {};
    if (!phaseGroups[phase][pool]) phaseGroups[phase][pool] = [];

    phaseGroups[phase][pool].push(line);
  });

  const embedLines: string[] = [];
  Object.entries(phaseGroups).forEach(([phase, pools]) => {
    embedLines.push(`\n**__${escapeMarkdown(phase.toUpperCase())}__**`);
    Object.entries(pools).forEach(([pool, matches]) => {
      embedLines.push(`\n**__Pool ${escapeMarkdown(pool)}__**`);
      embedLines.push(...matches);
    });
  });

  const MAX_EMBED_LENGTH = 4000;
  let buffer = '';

  for (const line of embedLines) {
    if ((buffer + '\n' + line).length > MAX_EMBED_LENGTH) {
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setDescription(buffer)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      buffer = line;
    } else {
      buffer += '\n' + line;
    }
  }

  if (buffer) {
    const finalEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setDescription(buffer)
      .setTimestamp()
      .setTitle('📊 Live Tournament Results');
    await channel.send({ embeds: [finalEmbed] });
  }
}
