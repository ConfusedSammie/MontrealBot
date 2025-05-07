const apiUrl = "https://api.start.gg/gql/alpha";
const bearerToken = "dfa048aa8c19f53334830ce8319256e8";

export async function getEventIdFromSlug(slug) {
  const query = `
    query getEventId($slug: String) {
      event(slug: $slug) {
        id
        name
      }
    }`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearerToken}`
    },
    body: JSON.stringify({ query, variables: { slug } })
  });

  const result = await response.json();

  if (response.ok && result.data?.event?.id) {
    return result.data.event.id;
  }

  throw new Error("Could not fetch event ID.");
}

export function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#');
}