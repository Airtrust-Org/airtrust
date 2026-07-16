declare module 'h5p-standalone' {
  export class H5P {
    constructor(container: HTMLElement, options: unknown);
    init(): Promise<void>;
    on(event: string, callback: (event: any) => void): void;
  }
}
