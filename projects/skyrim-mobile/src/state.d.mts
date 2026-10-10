export interface Position { x: number; z: number }
export interface Player extends Position { yaw:number; hp:number; stamina:number; gold:number; level:number }
export interface GameState {
  version:number;
  player:Player;
  inventory:Record<string, number>;
  quest:string;
  flags:{chestOpened:boolean;relicTaken:boolean;enemyDefeated:boolean};
  enemy:{hp:number;cooldown:number};
  dayTime:number;
  timePlayed:number;
  event:string;
}
export const SAVE_VERSION:number;
export const LANDMARKS:Record<string,Position>;
export const QUEST_STEPS:readonly string[];
export const QUEST_HINTS:Record<string,string>;
export function terrainHeight(x:number,z:number):number;
export function createState():GameState;
export function move(state:GameState,forward:number,right:number,dt:number):GameState;
export function tick(state:GameState,dt:number):GameState;
export function attack(state:GameState):string;
export function interact(state:GameState):string;
export function usePotion(state:GameState):boolean;
export function serialize(state:GameState):string;
export function deserialize(raw:string):GameState;
