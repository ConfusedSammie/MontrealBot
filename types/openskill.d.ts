declare module 'openskill' {
    export const rate: any;
    export interface Rating {
      mu: number;
      sigma: number;
    }
    export interface Options {
      tau?: number;
      mu?: number;
      sigma?: number;
      limitSigma?: boolean;
      preventSigmaIncrease?: boolean;
    }
  }
  