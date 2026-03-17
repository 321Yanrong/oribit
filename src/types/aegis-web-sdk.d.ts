declare module 'aegis-web-sdk' {
  export interface AegisOptions {
    id: string;
    uin?: string;
    reportApiSpeed?: boolean;
    reportAssetSpeed?: boolean;
    spa?: boolean;
  }

  export default class Aegis {
    constructor(options: AegisOptions);
    setConfig(config: Partial<AegisOptions>): void;
  }
}
