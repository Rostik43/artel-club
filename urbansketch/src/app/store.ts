import { createContext, useContext } from 'react'
import type { Ring } from '../geo/types'
import { emptyProject, type Project } from '../domain/project'
import type { Building } from '../domain/typologies'
import { typologyById } from '../domain/typologies'
import { normSetById } from '../domain/norms'
import { defaultGenerateOptions, type GenerateOptions, type Variant } from '../domain/generate'

export type Tool = 'select' | 'draw' | 'place'

export interface State {
  project: Project
  past: Project[]
  future: Project[]
  tool: Tool
  placingTypologyId: string
  draft: Ring
  selectedIds: string[]
  showBuildable: boolean
  showShadows: boolean
  showInsolation: boolean
  shadowHour: number
  generateOptions: GenerateOptions
  variants: Variant[]
  activeVariantId: string | null
  notice: { kind: 'info' | 'error'; text: string } | null
}

export const initialState = (): State => {
  const project = emptyProject()
  return {
    project,
    past: [],
    future: [],
    tool: 'select',
    placingTypologyId: 'sec-3x24',
    draft: [],
    selectedIds: [],
    showBuildable: true,
    showShadows: false,
    showInsolation: false,
    shadowHour: 12,
    generateOptions: defaultGenerateOptions(normSetById(project.normSetId)),
    variants: [],
    activeVariantId: null,
    notice: null,
  }
}

export type Action =
  | { type: 'patchProject'; patch: Partial<Project>; history?: boolean }
  | { type: 'setParcel'; ring: Ring; cadastralNumber?: string; name?: string }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setPlacingTypology'; id: string }
  | { type: 'draftAdd'; point: { x: number; y: number } }
  | { type: 'draftUndo' }
  | { type: 'draftCommit' }
  | { type: 'draftCancel' }
  | { type: 'addBuilding'; building: Building }
  | { type: 'updateBuilding'; id: string; patch: Partial<Building>; history?: boolean }
  | { type: 'moveSelected'; dx: number; dy: number; history?: boolean }
  | { type: 'deleteSelected' }
  | { type: 'select'; ids: string[] }
  | { type: 'setBuildings'; buildings: Building[] }
  | { type: 'setView'; patch: Partial<Pick<State, 'showBuildable' | 'showShadows' | 'showInsolation' | 'shadowHour'>> }
  | { type: 'setGenerateOptions'; patch: Partial<GenerateOptions> }
  | { type: 'setVariants'; variants: Variant[] }
  | { type: 'applyVariant'; id: string }
  | { type: 'setNotice'; notice: State['notice'] }
  | { type: 'loadProject'; project: Project }
  | { type: 'pushHistory'; snapshot: Project }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 50

const withHistory = (state: State, project: Project): State => ({
  ...state,
  project,
  past: [...state.past, state.project].slice(-HISTORY_LIMIT),
  future: [],
})

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'patchProject': {
      const project = { ...state.project, ...action.patch }
      return action.history === false ? { ...state, project } : withHistory(state, project)
    }
    case 'setParcel': {
      const project = {
        ...state.project,
        parcel: action.ring,
        cadastralNumber: action.cadastralNumber ?? state.project.cadastralNumber,
        name: action.name ?? state.project.name,
      }
      return { ...withHistory(state, project), draft: [], tool: 'select', variants: [], activeVariantId: null }
    }
    case 'setTool':
      return { ...state, tool: action.tool, draft: action.tool === 'draw' ? state.draft : [] }
    case 'setPlacingTypology':
      return { ...state, placingTypologyId: action.id, tool: 'place' }
    case 'draftAdd':
      return { ...state, draft: [...state.draft, action.point] }
    case 'draftUndo':
      return { ...state, draft: state.draft.slice(0, -1) }
    case 'draftCommit': {
      if (state.draft.length < 3) return { ...state, notice: { kind: 'error', text: 'Нужно минимум три точки' } }
      const project = { ...state.project, parcel: state.draft }
      return { ...withHistory(state, project), draft: [], tool: 'select', variants: [], activeVariantId: null }
    }
    case 'draftCancel':
      return { ...state, draft: [], tool: 'select' }
    case 'addBuilding': {
      const project = { ...state.project, buildings: [...state.project.buildings, action.building] }
      return { ...withHistory(state, project), selectedIds: [action.building.id] }
    }
    case 'updateBuilding': {
      const buildings = state.project.buildings.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b))
      const project = { ...state.project, buildings }
      return action.history === false ? { ...state, project } : withHistory(state, project)
    }
    case 'moveSelected': {
      const buildings = state.project.buildings.map((b) =>
        state.selectedIds.includes(b.id) ? { ...b, x: b.x + action.dx, y: b.y + action.dy } : b,
      )
      const project = { ...state.project, buildings }
      return action.history === false ? { ...state, project } : withHistory(state, project)
    }
    case 'deleteSelected': {
      if (!state.selectedIds.length) return state
      const buildings = state.project.buildings.filter((b) => !state.selectedIds.includes(b.id))
      return { ...withHistory(state, { ...state.project, buildings }), selectedIds: [] }
    }
    case 'select':
      return { ...state, selectedIds: action.ids }
    case 'setBuildings':
      return { ...withHistory(state, { ...state.project, buildings: action.buildings }), selectedIds: [] }
    case 'setView':
      return { ...state, ...action.patch }
    case 'setGenerateOptions':
      return { ...state, generateOptions: { ...state.generateOptions, ...action.patch } }
    case 'setVariants':
      return { ...state, variants: action.variants, activeVariantId: action.variants[0]?.id ?? null }
    case 'applyVariant': {
      const variant = state.variants.find((v) => v.id === action.id)
      if (!variant) return state
      return {
        ...withHistory(state, { ...state.project, buildings: variant.buildings }),
        activeVariantId: variant.id,
        selectedIds: [],
      }
    }
    case 'pushHistory':
      return { ...state, past: [...state.past, action.snapshot].slice(-HISTORY_LIMIT), future: [] }
    case 'setNotice':
      return { ...state, notice: action.notice }
    case 'loadProject':
      return { ...withHistory(state, action.project), selectedIds: [], variants: [], activeVariantId: null }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        selectedIds: [],
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selectedIds: [],
      }
    }
    default:
      return state
  }
}

export const makeBuilding = (typologyId: string, x: number, y: number, rotation = 0, floorsCap = 99): Building => {
  const t = typologyById(typologyId)
  return {
    id: `b${Math.random().toString(36).slice(2, 9)}`,
    typologyId,
    x,
    y,
    rotation,
    floors: Math.min(t.floors, floorsCap),
  }
}

export interface Store {
  state: State
  dispatch: (action: Action) => void
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreContext не инициализирован')
  return store
}
