import {
  CampaignStoryInput,
  CampaignStoryMaterial,
  CampaignStoryReference,
  CampaignStoryReferenceEntry,
} from '../types/campaign-story.types';

/**
 * Prompt for the campaign story (ticket #69): one continuous, condensed story of the
 * whole campaign so far, built from all session stories in chronological order and,
 * when Kanka is linked, from the written reports (journals) in Kanka. Those reports
 * are the only source for sessions that were never recorded.
 */
export const CAMPAIGN_STORY_MIN_WORDS = 500;
export const CAMPAIGN_STORY_MAX_WORDS = 1800;

/** With descriptions the reference stays under this; a larger campaign gets the names only. */
const MAX_REFERENCE_CHARS = 60_000;

export function buildCampaignStoryPrompt(material: CampaignStoryMaterial, targetWords: number): string {
  const target = Math.min(CAMPAIGN_STORY_MAX_WORDS, Math.max(CAMPAIGN_STORY_MIN_WORDS, Math.round(targetWords)));
  const { timeline, undatedJournals } = material;
  const sourceCount = timeline.length + undatedJournals.length;
  const hasJournals = undatedJournals.length > 0 || timeline.some(source => source.kind === 'journal');

  const timelineBlocks = timeline.map((source, index) => sourceBlock(source, index + 1)).join('\n\n---\n\n');
  const undatedBlocks = undatedJournals
    .map((source, index) => sourceBlock(source, timeline.length + index + 1))
    .join('\n\n---\n\n');
  const reference = buildReferenceBlock(material.reference);

  return `Je bent een ervaren verhalenverteller die D&D-campagnes samenvat.
Je krijgt de bronnen van één campagne: de verhalen van de gespeelde sessies${hasJournals ? ' en de verslagen die de spelers en de DM zelf hebben geschreven' : ''}, in chronologische volgorde.
Schrijf daarvan ÉÉN doorlopend verhaal van de hele campagne tot nu toe, volledig in het Nederlands.

DOEL:
- Dit is een SAMENVATTING, geen hervertelling van elke scène. Iemand moet in één keer kunnen teruglezen wat de party tot nu toe heeft meegemaakt
- Focus op wat het verhaal vooruit helpt: belangrijke beslissingen, wendingen, ontmoetingen met sleutel-NPC's, wat er gewonnen of verloren is, en open mysteries
- Laat losse gevechtsdetails, dobbelsteenworpen en kleine zijpaden weg, tenzij ze echt bepalend waren

LENGTE (BELANGRIJK):
- Richt je op ongeveer ${target} woorden. Blijf tussen ${CAMPAIGN_STORY_MIN_WORDS} en ${CAMPAIGN_STORY_MAX_WORDS} woorden
- Er zijn ${sourceCount} bron(nen). Hoe meer bronnen, hoe compacter je per bron samenvat
- Vroege sessies mogen compacter (dat is inmiddels geschiedenis), recente sessies iets uitgebreider
${hasJournals ? `
SOORTEN BRONNEN:
- SESSIEVERHAAL: het verhaal van een sessie, geschreven uit de opname van die avond
- VERSLAG: een verslag uit Kanka dat een speler of de DM zelf heeft geschreven. Van sommige sessies, vaak de eerste van de campagne, bestaat geen opname: dan is het verslag de enige bron van wat er die avond gebeurde
- Een verslag telt even zwaar als een sessieverhaal. Wat alleen in een verslag staat, hoort net zo goed in het verhaal
- Beschrijven een verslag en een sessieverhaal dezelfde avond (dezelfde datum, of duidelijk dezelfde gebeurtenissen), voeg ze dan samen en vertel het één keer. Spreken ze elkaar tegen in een naam of een feit, dan geldt het geschreven verslag
- Een verslag kan in de ik- of wij-vorm zijn geschreven, vanuit één personage. Zet het om naar de derde persoon. "Ik" is de schrijver die bij het verslag staat. Staat er geen schrijver bij en blijkt die ook niet uit de tekst, verzin dan geen naam
- Een verslag geeft de blik van één personage. Neem de gebeurtenissen over, niet de meningen of vermoedens van de schrijver als feit
- Beschrijft een verslag geen gebeurtenissen van de party maar achtergrond (lore, een notitie, een beschrijving), gebruik het dan alleen als achtergrond en vertel het niet na als gebeurtenis
- Noem de bronnen zelf niet in het verhaal ("volgens het verslag...", "in de opname...")
` : ''}
CHRONOLOGIE:
- Behoud de volgorde van de bronnen zoals hieronder aangeleverd
- Spreken sessies elkaar tegen, dan geldt de latere sessie. Speculeer niet over de tegenstrijdigheid${undatedJournals.length > 0 ? `
- De verslagen onder "VERSLAGEN ZONDER DATUM" staan NIET op hun plek. Zet elk verslag op de juiste plek in het verhaal aan de hand van de titel (bijvoorbeeld een sessienummer) en de inhoud: waar sluit het op aan, wat is er dan al gebeurd? De dag waarop het is aangemaakt is hooguit een aanwijzing
- Blijkt nergens uit waar zo'n verslag thuishoort, behandel het dan als iets van vóór de eerste opgenomen sessie` : ''}

TROUW AAN DE BRON (KRITISCH):
- Gebruik UITSLUITEND gebeurtenissen, namen, plekken en details die in de ${hasJournals ? 'sessieverhalen en verslagen' : 'sessieverhalen'} staan
- Verzin NOOIT gebeurtenissen, personages, dialogen, motieven of verbanden tussen sessies die niet in de bron staan
- Is iets in de bron vaag, houd het dan vaag${reference ? `
- De NASLAG UIT KANKA is geen bron van gebeurtenissen. Gebruik hem om namen en plekken goed te spellen en om te weten wie of wat iets is. Vertel niets uit de naslag dat niet ook in een ${hasJournals ? 'sessieverhaal of verslag' : 'sessieverhaal'} gebeurt` : ''}

STRUCTUUR & STIJL:
- Schrijf in de derde persoon, verleden tijd, als één doorlopend verhaal
- Gebruik markdown. Je mag ##-tussenkopjes gebruiken per verhaalboog of fase van de campagne, maar NOOIT een kopje per sessie${hasJournals ? ' of per verslag' : ''}
- Noem geen sessienummers of datums in de tekst ("in sessie 3...")
- Sluit af met een korte alinea onder het kopje "## Waar staan we nu?" met de huidige situatie van de party en de open draden

OUTPUT:
Geef een JSON-object terug met:
- "title": een korte, verhalende titel voor het verhaal tot nu toe (maximaal 8 woorden)
- "content": het verhaal in markdown (zonder de titel als kop bovenaan)
${reference ? `\n${reference}\n` : ''}
BRONNEN (chronologisch):

${timelineBlocks}${undatedBlocks ? `${timelineBlocks ? '\n\n---\n\n' : ''}VERSLAGEN ZONDER DATUM (nog niet op hun plek):\n\n${undatedBlocks}` : ''}`;
}

function sourceBlock(source: CampaignStoryInput, number: number): string {
  if (source.kind === 'journal') {
    const date = source.sessionDate
      ? source.sessionDate
      : `Datum onbekend${source.uploadedAt ? ` (aangemaakt op ${source.uploadedAt})` : ''}`;
    const details = [
      source.journalType ? `soort: ${source.journalType}` : '',
      source.author ? `geschreven door ${source.author}` : '',
    ].filter(Boolean).join(', ');
    return `BRON ${number} — VERSLAG — ${source.title} — ${date}${details ? ` — ${details}` : ''}\n${source.content}`;
  }

  const date = source.sessionDate
    ? source.sessionDate
    : `Datum onbekend${source.uploadedAt ? ` (geüpload op ${source.uploadedAt})` : ''}`;
  return `BRON ${number} — SESSIEVERHAAL — ${source.title} — ${date}\n${source.content}`;
}

/** Who and what exists in the campaign, or '' when Kanka has nothing to list. */
function buildReferenceBlock(reference: CampaignStoryReference | undefined): string {
  if (!reference) return '';

  const build = (withDescriptions: boolean) => [
    referenceSection('Personages', reference.characters, withDescriptions),
    referenceSection('Plekken', reference.locations, withDescriptions),
    referenceSection('Quests', reference.quests, withDescriptions),
    referenceSection('Organisaties', reference.organisations, withDescriptions),
  ].filter(Boolean).join('\n');

  let sections = build(true);
  if (sections.length > MAX_REFERENCE_CHARS) {
    sections = build(false);
  }
  return sections ? `NASLAG UIT KANKA (wie en wat er bestaat; GEEN gebeurtenissen):\n${sections}` : '';
}

function referenceSection(label: string, entries: CampaignStoryReferenceEntry[], withDescriptions: boolean): string {
  if (entries.length === 0) return '';
  if (!withDescriptions) {
    return `${label}: ${entries.map(entry => entry.name).join(', ')}`;
  }
  const lines = entries.map(entry => {
    const type = entry.type ? ` (${entry.type})` : '';
    const description = entry.description ? `: ${entry.description}` : '';
    return `- ${entry.name}${type}${description}`;
  });
  return `${label}:\n${lines.join('\n')}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
