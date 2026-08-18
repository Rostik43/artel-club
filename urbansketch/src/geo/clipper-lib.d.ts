declare module 'clipper-lib' {
  export interface IntPoint {
    X: number
    Y: number
  }

  export const PolyType: { ptSubject: number; ptClip: number }
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
  export const EndType: { etClosedPolygon: number; etClosedLine: number; etOpenbutt: number; etOpenSquare: number; etOpenRound: number }

  export class Clipper {
    constructor(initOptions?: number)
    AddPath(path: IntPoint[], polyType: number, closed: boolean): boolean
    AddPaths(paths: IntPoint[][], polyType: number, closed: boolean): boolean
    Execute(clipType: number, solution: IntPoint[][], subjFillType?: number, clipFillType?: number): boolean
    static Area(path: IntPoint[]): number
    static Orientation(path: IntPoint[]): boolean
    static CleanPolygons(paths: IntPoint[][], distance?: number): IntPoint[][]
    static SimplifyPolygons(paths: IntPoint[][], fillType?: number): IntPoint[][]
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, roundPrecision?: number)
    AddPath(path: IntPoint[], joinType: number, endType: number): void
    AddPaths(paths: IntPoint[][], joinType: number, endType: number): void
    Execute(solution: IntPoint[][], delta: number): void
    Clear(): void
  }
}
