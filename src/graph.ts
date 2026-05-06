export type NodeFolder = 'docs' | 'initiatives' | 'waves' | 'ops'
export type NodeType = 'feature' | 'task' | 'initiative' | 'wave' | 'ops' | 'error'
export type NodeStatus =
  | 'complete'
  | 'in_progress'
  | 'draft'
  | 'deprecated'
  | 'active'
  | 'planned'
  | 'cancelled'
  | string

export type EdgeType = 'depends_on' | 'initiative_wave' | 'wave_feature'

export interface GitData {
  lastCommitHash: string
  lastCommitDate: string
  lastCommitMessage: string
  lastCommitAuthor: string
  commitCount: number
  hasUncommittedChanges: boolean
}

export interface GitCommit {
  hash: string
  shortHash: string
  date: string
  relativeDate: string
  message: string
  author: string
}

export interface NodeData {
  id: string
  filepath: string
  folder: NodeFolder
  title: string
  type: NodeType
  status: NodeStatus
  depends_on: string[]
  initiative: string | null
  wave: string | null
  wave_status: string | null
  known_issues_count: number
  last_synced: string
  mdd_version: number
  source_files: string[]
  routes: string[]
  edition: string
  phase: string
  icon: string
  git: GitData | null
}

export interface EdgeData {
  source: string
  target: string
  type: EdgeType
  broken: boolean
}

export interface GraphCache {
  nodes: NodeData[]
  edges: EdgeData[]
}

export interface FrontmatterCacheEntry {
  mtime: number
  data: NodeData
}

export interface BodyCacheEntry {
  mtime: number
  html: string
}

export interface GitCacheEntry {
  commits: GitCommit[]
  hasUncommittedChanges: boolean
  loadedAt: number
}
