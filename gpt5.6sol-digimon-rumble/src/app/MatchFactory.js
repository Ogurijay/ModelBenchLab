import {
  ALL_CHARACTERS,
  ARENAS,
  CHARACTERS,
  CUP_ROUTE,
  DIFFICULTIES,
  RULES,
} from '../data/gameData.js';

const FIGHTER_IDS = Object.freeze(['p1', 'p2', 'p3', 'p4']);
const ITEM_TYPES = Object.freeze(['energy', 'health', 'power', 'life']);
const MODES = new Set(['cup', 'free', 'training']);
const DIFFICULTY_IDS = new Set(DIFFICULTIES.map((entry) => entry.id));

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const asInteger = (value, fallback) => Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback);
const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const characterById = (id) => ALL_CHARACTERS.find((character) => character.id === id) ?? null;

function uniqueCharacters(characters) {
  const seen = new Set();
  return characters.filter((character) => {
    if (!character || seen.has(character.id)) return false;
    seen.add(character.id);
    return true;
  });
}

function rotate(values, offset) {
  if (!values.length) return [];
  const start = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function availableCharacters(flowState, primary) {
  const unlocks = flowState?.save?.profile?.unlockedCharacters;
  const unlockedIds = Array.isArray(unlocks) ? new Set(unlocks) : null;
  const unlocked = unlockedIds
    ? ALL_CHARACTERS.filter((character) => unlockedIds.has(character.id))
    : CHARACTERS;
  const ordered = [
    ...unlocked.filter((character) => !character.boss),
    ...unlocked.filter((character) => character.boss),
    // 存档异常时仍用首发阵容补足四个唯一槽位，不引入未解锁 Boss。
    ...CHARACTERS,
  ];
  return uniqueCharacters(ordered).filter((character) => character.id !== primary.id);
}

function cupDefinition(match, context) {
  const requested = match.cupRound ?? context.cupRound ?? 0;
  const byId = typeof requested === 'string'
    ? CUP_ROUTE.findIndex((round) => round.id === requested)
    : -1;
  const index = clamp(byId >= 0 ? byId : asInteger(requested, 0), 0, CUP_ROUTE.length - 1);
  return { index, round: CUP_ROUTE[index] };
}

function resolveDifficulty(value) {
  return DIFFICULTY_IDS.has(value) ? value : 'normal';
}

function resolveRule(value, fallback = 'stock') {
  return RULES[value] ? value : fallback;
}

function resolveArena(id) {
  return ARENAS.find((arena) => arena.id === id) ?? ARENAS[0];
}

function chooseFreeCharacters({ flowState, primary, match, localPlayers, cpuCount, arena }) {
  const pool = rotate(
    availableCharacters(flowState, primary),
    Math.max(0, ARENAS.findIndex((entry) => entry.id === arena.id)),
  );
  const preferredCpu = uniqueCharacters(
    (Array.isArray(match.opponents) ? match.opponents : [])
      .map(characterById)
      .filter((character) => character?.id !== primary.id),
  ).slice(0, cpuCount);
  const reservedCpuIds = new Set(preferredCpu.map((character) => character.id));
  const chosen = [primary];

  const addUnique = (character) => {
    if (!character || chosen.some((entry) => entry.id === character.id)) return false;
    chosen.push(character);
    return true;
  };

  // P2-P4 自动轮换首发角色，并为显式指定的 CPU 对手预留角色。
  for (const character of pool.filter((entry) => !reservedCpuIds.has(entry.id))) {
    if (chosen.length >= localPlayers) break;
    addUnique(character);
  }
  for (const character of pool) {
    if (chosen.length >= localPlayers) break;
    addUnique(character);
  }
  for (const character of preferredCpu) addUnique(character);
  for (const character of pool) {
    if (chosen.length >= localPlayers + cpuCount) break;
    addUnique(character);
  }

  if (chosen.length !== localPlayers + cpuCount) {
    throw new Error('无法为自由乱斗生成足够的唯一角色');
  }
  return chosen;
}

function chooseTrainingCharacters(flowState, primary, match, arena) {
  const preferred = (Array.isArray(match.opponents) ? match.opponents : [])
    .map(characterById)
    .find((character) => character && character.id !== primary.id);
  const fallback = rotate(
    availableCharacters(flowState, primary),
    Math.max(0, ARENAS.findIndex((entry) => entry.id === arena.id)),
  )[0];
  return [primary, preferred ?? fallback ?? CHARACTERS.find((character) => character.id !== primary.id)];
}

function fighterFrom(character, index, localPlayers, difficulty, stocks, training) {
  return {
    id: FIGHTER_IDS[index],
    characterId: character.id,
    name: character.name,
    en: character.en,
    color: character.color,
    accent: character.accent,
    boss: Boolean(character.boss),
    stats: { ...(character.stats ?? {}) },
    // 传递真实形态资料；普通角色保持三形态，Boss 保持单形态。
    forms: character.forms.map((form) => ({ ...form })),
    controller: index < localPlayers ? 'human' : 'cpu',
    difficulty,
    stocks,
    energy: training ? 100 : 0,
  };
}

/**
 * 把流程状态转换为 BattleSimulation、渲染和输入系统都可直接消费的比赛定义。
 */
export function buildMatchConfig(flowState = {}, options = {}) {
  const context = flowState.context ?? {};
  const sourceMatch = context.match ?? {};
  const mode = MODES.has(sourceMatch.mode ?? context.mode)
    ? (sourceMatch.mode ?? context.mode)
    : 'free';
  const primary = characterById(sourceMatch.characterId ?? context.characterId) ?? CHARACTERS[0];
  const cup = mode === 'cup' ? cupDefinition(sourceMatch, context) : null;
  const route = cup?.round ?? {};
  const match = mode === 'cup'
    ? {
        ...route,
        ...sourceMatch,
        cupRound: cup.index,
        // 杯赛对手属于路线规则，不能被 UI 的自由编成覆盖。
        opponents: [...(route.opponents ?? [])],
      }
    : { ...sourceMatch };
  const arena = resolveArena(match.stageId ?? match.arena ?? context.stageId ?? route.arena ?? 'terminal');

  let localPlayers;
  let cpuCount;
  let characters;
  if (mode === 'cup') {
    localPlayers = 1;
    characters = [
      primary,
      ...match.opponents.map((id) => characterById(id)).filter(Boolean),
    ].slice(0, 4);
    cpuCount = characters.length - 1;
  } else if (mode === 'training') {
    localPlayers = 1;
    cpuCount = 1;
    characters = chooseTrainingCharacters(flowState, primary, match, arena);
  } else {
    localPlayers = clamp(asInteger(options.localPlayers ?? match.localPlayers, 1), 1, 4);
    const minimumCpu = localPlayers === 1 ? 1 : 0;
    cpuCount = clamp(
      asInteger(options.cpuCount ?? match.cpuCount, 1),
      minimumCpu,
      4 - localPlayers,
    );
    characters = chooseFreeCharacters({
      flowState, primary, match, localPlayers, cpuCount, arena,
    });
  }

  const difficulty = resolveDifficulty(
    options.difficulty ?? match.difficulty ?? flowState.settings?.difficulty,
  );
  const rule = mode === 'training'
    ? 'training'
    : resolveRule(options.rule ?? match.rule ?? route.rule, 'stock');
  const stocks = Math.max(1, asInteger(match.stocks, 3));
  const raceTarget = Math.max(1, asInteger(match.target ?? match.raceTarget, 2));
  const duration = mode === 'training'
    ? Infinity
    : positiveNumber(
        match.time ?? match.duration ?? options.battleTime ?? flowState.settings?.battleTime,
        90,
      );
  const roster = characters.map((character, index) => (
    fighterFrom(character, index, localPlayers, difficulty, stocks, mode === 'training')
  ));
  const humanIds = roster
    .filter((fighter) => fighter.controller === 'human')
    .map((fighter) => fighter.id);
  const stageIndex = Math.max(0, ARENAS.findIndex((entry) => entry.id === arena.id));
  const simulation = {
    rule,
    fighters: roster.map((fighter) => clone(fighter)),
    duration,
    // time 是界面层使用的同义字段；BattleSimulation 实际读取 duration。
    time: duration,
    stocks,
    raceTarget,
    readyTime: 2.4,
    respawnDelay: 1,
    hazards: arena.hazard ? [arena.hazard] : [],
    itemTypes: [...ITEM_TYPES],
    seed: (cup?.index ?? stageIndex) + 17,
  };

  return {
    simulation,
    roster,
    humanIds,
    arena: clone(arena),
    meta: {
      mode,
      rule,
      difficulty,
      localPlayers,
      cpuCount,
      totalFighters: roster.length,
      battleTime: duration,
      stocks,
      raceTarget,
      stageId: arena.id,
      characterId: primary.id,
      cupRound: cup?.index ?? null,
      match: clone({
        ...match,
        mode,
        rule,
        stageId: arena.id,
        characterId: primary.id,
        localPlayers,
        cpuCount,
        opponents: roster.slice(localPlayers).map((fighter) => fighter.characterId),
      }),
    },
  };
}

function rankingWinner(state) {
  const leaders = (Array.isArray(state?.ranking) ? state.ranking : [])
    .filter((entry) => entry.rank === 1);
  return leaders.length === 1 ? leaders[0].id : leaders.length > 1 ? 'draw' : null;
}

/**
 * 将 BattleSimulation 快照归一化为 GameFlowController.finishBattle 所需结果。
 */
export function summarizeBattle(state = {}, humanIds = []) {
  const fighters = Array.isArray(state.fighters)
    ? state.fighters
    : [state.player, state.enemy].filter(Boolean);
  const normalizedHumans = [...new Set(
    (Array.isArray(humanIds) ? humanIds : [humanIds])
      .filter((id) => id !== null && id !== undefined)
      .map(String),
  )];
  if (!normalizedHumans.length) {
    for (const fighter of fighters) {
      if (fighter.controller === 'human') normalizedHumans.push(String(fighter.id));
    }
  }
  const humanSet = new Set(normalizedHumans);
  const winner = state.winner ?? state.result?.winner ?? rankingWinner(state) ?? 'draw';
  const explicitOutcome = state.outcome ?? state.result?.outcome;
  let outcome;
  if (['win', 'loss', 'draw'].includes(explicitOutcome)) {
    outcome = explicitOutcome;
  } else if (winner === 'draw' || winner === null) {
    outcome = 'draw';
  } else if (humanSet.has(String(winner)) || winner === 'player') {
    outcome = 'win';
  } else {
    outcome = 'loss';
  }

  const humanFighters = fighters.filter((fighter) => humanSet.has(String(fighter.id)));
  const maxCombo = Math.max(
    0,
    Number(state.maxCombo ?? state.result?.maxCombo) || 0,
    Number(state.player?.maxCombo) || 0,
    ...humanFighters.map((fighter) => Number(fighter.maxCombo) || 0),
  );
  const directDamage = state.damageDealt
    ?? state.damage
    ?? state.result?.damageDealt
    ?? state.player?.damageDealt;
  const fighterDamage = humanFighters.reduce(
    (total, fighter) => total + (Number(fighter.damageDealt) || 0),
    0,
  );
  const eventDamage = (Array.isArray(state.events) ? state.events : []).reduce((total, event) => (
    event.type === 'hit' && humanSet.has(String(event.attacker))
      ? total + (Number(event.damage) || 0)
      : total
  ), 0);
  const damage = Math.max(
    0,
    Number.isFinite(Number(directDamage)) ? Number(directDamage) : (fighterDamage || eventDamage),
  );
  const configuredDuration = Number(state.rules?.duration ?? state.duration);
  const remaining = Number(state.time);
  const inferredElapsed = Number.isFinite(configuredDuration) && Number.isFinite(remaining)
    ? configuredDuration - remaining
    : 0;
  const elapsed = Math.max(
    0,
    Number(state.durationSeconds ?? state.result?.durationSeconds ?? state.elapsed ?? inferredElapsed) || 0,
  );

  return {
    outcome,
    winner,
    maxCombo,
    damage,
    damageDealt: damage,
    elapsed,
    time: elapsed,
    durationSeconds: elapsed,
    humanIds: normalizedHumans,
  };
}

export default buildMatchConfig;
