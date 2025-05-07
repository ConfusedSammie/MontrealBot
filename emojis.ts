const emojis = [
    { id: "1369555530653368321", name: "yoshi_default"},
    { id: "1369555522386264185", name: "young_link_default"},
    { id: "1369555542451814431", name: "zelda_default"},
    { id: "1369555500567363584", name: "roy_default"},
    { id: "1369555507001561149", name: "samus_default"},
    { id: "1369555513594875944", name: "sheik_default"},
    { id: "1369555472356474880", name: "peach_default"},
    { id: "1369555478472032276", name: "pichu_default"},
    { id: "1369555485249765459", name: "pikachu_default"},
    { id: "1369555459090157580", name: "mewtwo_default"},
    { id: "1369555402689085472", name: "game_and_watch_default"},
    { id: "1369555465448718397", name: "ness_default"},
    { id: "1369555444087001128", name: "luigi_default"},
    { id: "1369555445953593405", name: "mario_default"},
    { id: "1369555453423386725", name: "marth_default"},
    { id: "1369555493089181736", name: "jigglypuff_default"},
    { id: "1369555424726093875", name: "kirby_default"},
    { id: "1369555431940427837", name: "link_default"},
    { id: "1369555388654948423", name: "fox_default"},
    { id: "1369555396426993815", name: "ganondorf_default"},
    { id: "1369555410746347571", name: "ice_climbers_default"},
    { id: "1369555350998614107", name: "bowser_default"},
    { id: "1369555358686908466", name: "donkey_kong_default"},
    { id: "1369555366412554311", name: "dr_mario_default"},
    { id: "1369555374327332895", name: "falco_default"},
    { id: "1369555381344407663", name: "captain_falcon_default"},
    { id: "1369526346140876892", name: "SILVER1" },
    { id: "1369526354726490174", name: "SILVER2" },
    { id: "1369525983404625960", name: "SILVER3" },
    { id: "1369526324401672283", name: "PLATINUM1" },
    { id: "1369526331238256731", name: "PLATINUM2" },
    { id: "1369526338393870396", name: "PLATINUM3" },
    { id: "1369526284039749673", name: "MASTER1" },
    { id: "1369526294555131904", name: "MASTER2" },
    { id: "1369526302146822246", name: "MASTER3" },
    { id: "1369526242684178482", name: "GOLD1" },
    { id: "1369526258651893791", name: "GOLD2" },
    { id: "1369526265832542268", name: "GOLD3" },
    { id: "1369526216197013534", name: "DIAMOND1" },
    { id: "1369526223457353849", name: "DIAMOND2" },
    { id: "1369526231757754422", name: "DIAMOND3" },
    { id: "1369526027327635496", name: "BRONZE1" },
    { id: "1369526142117347338", name: "BRONZE2" },
    { id: "1369526209779859548", name: "BRONZE3" },
    { id: "1369526273038225519", name: "GRANDMASTER" },
    { id: "1369526309570740395", name: "NONE" },
  ];
  
  function uniqueId(id: string, name: string) {
    return `<:${name}:${id}>`;
  }
  
  const globalEmojis = emojis.map(({ id, name }) => [name, uniqueId(id, name)]);
  const lookupByName = Object.fromEntries(globalEmojis) as {
    [key: string]: string;
  };
  export function getEmojiIdForName(name: string) {
    const result = lookupByName[name];
    if (!result) console.log("Couldn't find emoji for name: " + name);
    return result;
  }
  
  export function getCharacterEmoji(character: string): string {
    const key = `${character.toLowerCase()}_default`;
    return getEmojiIdForName(key) || '❓';
  }
  
  
  