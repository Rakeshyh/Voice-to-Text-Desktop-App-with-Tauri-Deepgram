
export enum AppStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR'
}

export interface TranscriptItem {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: 'user' | 'model';
}

export interface TranscriptionState {
  currentText: string;
  currentSpeaker: 'user' | 'model';
  history: TranscriptItem[];
}
