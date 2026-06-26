import type { LanguagePack } from "./types";

export const defaultLanguagePacks: LanguagePack[] = [
  {
    code: "en",
    name: "English",
    downloaded: true,
    audio_available: true,
    prompts_json: [
      {
        id: "intro",
        icon: "👋",
        tester_instruction: "Confirm the client is ready and explain that you will record the spoken answers for data quality.",
        client_prompt: "We will do a simple vision check. Please answer in the language you are comfortable with.",
        why_this_matters: "This reduces missing information and reminds the tester that data capture supports stock and impact reporting."
      },
      {
        id: "right-distance",
        icon: "🔵",
        tester_instruction: "Test the right eye first. Right eye follows the blue wheel colour cue.",
        client_prompt: "Cover your left eye. Read the smallest line you can see clearly.",
        why_this_matters: "Right/left colour coupling reduces wrong-eye data entry in bright field conditions."
      },
      {
        id: "left-distance",
        icon: "⚪",
        tester_instruction: "Test the left eye next. Left eye follows the white wheel colour cue.",
        client_prompt: "Cover your right eye. Read the smallest line you can see clearly.",
        why_this_matters: "Testing both eyes separately keeps the record complete without changing the clinical flow."
      },
      {
        id: "glasses-check",
        icon: "👓",
        tester_instruction: "Ask whether the client already has glasses and whether they feel comfortable trying lenses.",
        client_prompt: "Do you currently have glasses? After trying these, tell me if your vision feels clearer and comfortable.",
        why_this_matters: "Comfort feedback helps QC understand whether the spoken interaction matched the structured record."
      }
    ]
  },
  {
    code: "tpi",
    name: "Tok Pisin demo",
    downloaded: false,
    audio_available: true,
    prompts_json: [
      {
        id: "intro",
        icon: "👋",
        tester_instruction: "Confirm the client is ready and use the local-language client prompt.",
        client_prompt: "Yumi bai mekim liklik ai test. Yu ken bekim long tokples yu save gut long en.",
        why_this_matters: "Local-language prompts make the app feel less like English paperwork."
      },
      {
        id: "right-distance",
        icon: "🔵",
        tester_instruction: "Test the right eye first. Right eye follows the blue wheel colour cue.",
        client_prompt: "Pasim left ai. Rit long liklik lain yu inap lukim klia.",
        why_this_matters: "The blue cue helps the tester keep right-eye data consistent."
      },
      {
        id: "left-distance",
        icon: "⚪",
        tester_instruction: "Test the left eye next. Left eye follows the white wheel colour cue.",
        client_prompt: "Pasim right ai. Rit long liklik lain yu inap lukim klia.",
        why_this_matters: "The white cue helps the tester keep left-eye data consistent."
      },
      {
        id: "glasses-check",
        icon: "👓",
        tester_instruction: "Ask about current glasses and comfort after trying lenses.",
        client_prompt: "Yu gat glas nau? Taim yu traim dispela, lukluk i kamap klia na orait long ai?",
        why_this_matters: "Comfort response is one of the details that can be missed when information stays verbal."
      }
    ]
  },
  {
    code: "bis",
    name: "Bislama demo",
    downloaded: false,
    audio_available: true,
    prompts_json: [
      {
        id: "intro",
        icon: "👋",
        tester_instruction: "Confirm the client is ready and use the local-language client prompt.",
        client_prompt: "Bambae yumi mekem wan smol ae test. Yu save ansa long lanwis we yu harem gud long hem.",
        why_this_matters: "Local-language prompts reduce reliance on English reading."
      },
      {
        id: "right-distance",
        icon: "🔵",
        tester_instruction: "Test the right eye first. Right eye follows the blue wheel colour cue.",
        client_prompt: "Kavremap lef ae. Ridim smol laen we yu save luk klia.",
        why_this_matters: "The blue cue keeps the workflow anchored to the physical OOXii kit."
      },
      {
        id: "left-distance",
        icon: "⚪",
        tester_instruction: "Test the left eye next. Left eye follows the white wheel colour cue.",
        client_prompt: "Kavremap raet ae. Ridim smol laen we yu save luk klia.",
        why_this_matters: "The white cue keeps left-eye data entry distinct from right-eye data."
      },
      {
        id: "glasses-check",
        icon: "👓",
        tester_instruction: "Ask about current glasses and comfort after trying lenses.",
        client_prompt: "Yu gat glas naoia? Taem yu traem hemia, lukluk blong yu i klia mo i harem gud?",
        why_this_matters: "Spoken comfort notes can become structured data for QC."
      }
    ]
  }
];

export function getFallbackPack(packs: LanguagePack[]) {
  return packs.find((pack) => pack.code === "en") ?? defaultLanguagePacks[0];
}
