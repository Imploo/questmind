import { CampaignStoryInput } from '../types/campaign-story.types';

/**
 * Prompt for the campaign story (ticket #69): one continuous, condensed story of the
 * whole campaign so far, built from all session stories in chronological order.
 * Kanka context is intentionally not included — the session stories already used it.
 */
export const CAMPAIGN_STORY_MIN_WORDS = 500;
export const CAMPAIGN_STORY_MAX_WORDS = 1800;

export function buildCampaignStoryPrompt(sessions: CampaignStoryInput[], targetWords: number): string {
  const target = Math.min(CAMPAIGN_STORY_MAX_WORDS, Math.max(CAMPAIGN_STORY_MIN_WORDS, Math.round(targetWords)));

  const sessionBlocks = sessions
    .map((session, index) => {
      const date = session.sessionDate
        ? session.sessionDate
        : `Datum onbekend${session.uploadedAt ? ` (geüpload op ${session.uploadedAt})` : ''}`;
      return `SESSIE ${index + 1} — ${session.title} — ${date}\n${session.content}`;
    })
    .join('\n\n---\n\n');

  return `Je bent een ervaren verhalenverteller die D&D-campagnes samenvat.
Je krijgt de verhalen van alle gespeelde sessies van één campagne, in chronologische volgorde.
Schrijf daarvan ÉÉN doorlopend verhaal van de hele campagne tot nu toe, volledig in het Nederlands.

DOEL:
- Dit is een SAMENVATTING, geen hervertelling van elke scène. Iemand moet in één keer kunnen teruglezen wat de party tot nu toe heeft meegemaakt
- Focus op wat het verhaal vooruit helpt: belangrijke beslissingen, wendingen, ontmoetingen met sleutel-NPC's, wat er gewonnen of verloren is, en open mysteries
- Laat losse gevechtsdetails, dobbelsteenworpen en kleine zijpaden weg, tenzij ze echt bepalend waren

LENGTE (BELANGRIJK):
- Richt je op ongeveer ${target} woorden. Blijf tussen ${CAMPAIGN_STORY_MIN_WORDS} en ${CAMPAIGN_STORY_MAX_WORDS} woorden
- Er zijn ${sessions.length} sessie(s). Hoe meer sessies, hoe compacter je per sessie samenvat
- Vroege sessies mogen compacter (dat is inmiddels geschiedenis), recente sessies iets uitgebreider

CHRONOLOGIE:
- Behoud de volgorde van de sessies zoals hieronder aangeleverd
- Spreken sessies elkaar tegen, dan geldt de latere sessie. Speculeer niet over de tegenstrijdigheid

TROUW AAN DE BRON (KRITISCH):
- Gebruik UITSLUITEND gebeurtenissen, namen, plekken en details die in de sessieverhalen staan
- Verzin NOOIT gebeurtenissen, personages, dialogen, motieven of verbanden tussen sessies die niet in de bron staan
- Is iets in de bron vaag, houd het dan vaag

STRUCTUUR & STIJL:
- Schrijf in de derde persoon, verleden tijd, als één doorlopend verhaal
- Gebruik markdown. Je mag ##-tussenkopjes gebruiken per verhaalboog of fase van de campagne, maar NOOIT een kopje per sessie
- Noem geen sessienummers of datums in de tekst ("in sessie 3...")
- Sluit af met een korte alinea onder het kopje "## Waar staan we nu?" met de huidige situatie van de party en de open draden

OUTPUT:
Geef een JSON-object terug met:
- "title": een korte, verhalende titel voor het verhaal tot nu toe (maximaal 8 woorden)
- "content": het verhaal in markdown (zonder de titel als kop bovenaan)

SESSIEVERHALEN (chronologisch):

${sessionBlocks}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
