
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { createPcmBlob } from "../utils/audioUtils";

export type GeminiErrorType = 'NETWORK' | 'API' | 'PERMISSION' | 'SAFETY' | 'QUOTA' | 'UNKNOWN';

export interface GeminiError {
  message: string;
  type: GeminiErrorType;
  details?: any;
}

export class GeminiService {
  private session: any | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isConnecting: boolean = false;
  private sessionReady: boolean = false;

  async connectLive(callbacks: {
    onTranscription: (text: string, isInput: boolean) => void;
    onTurnComplete: () => void;
    onError: (err: GeminiError) => void;
  }) {
    this.disconnect();
    
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      callbacks.onError({ 
        message: "API Key is missing. Please check your setup.", 
        type: 'API' 
      });
      return;
    }

    this.isConnecting = true;
    this.sessionReady = false;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 16000 
        });
        
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      } catch (e) {
        callbacks.onError({ message: "Unable to start the audio engine.", type: 'UNKNOWN' });
        throw e;
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          } 
        });
      } catch (e: any) {
        const msg = e.name === 'NotAllowedError' ? "Microphone access denied." : "Could not access microphone.";
        callbacks.onError({ message: msg, type: 'PERMISSION' });
        throw e;
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!this.isConnecting || !this.audioContext || !this.stream) return;

            try {
              const source = this.audioContext.createMediaStreamSource(this.stream);
              this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
              
              this.scriptProcessor.onaudioprocess = (e) => {
                if (!this.sessionReady) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                
                sessionPromise.then((session: any) => {
                  if (session && this.sessionReady) {
                    session.sendRealtimeInput({ media: pcmBlob });
                  }
                }).catch(() => {});
              };

              source.connect(this.scriptProcessor);
              this.scriptProcessor.connect(this.audioContext.destination);
              this.sessionReady = true;
              this.isConnecting = false;
            } catch (err) {
              callbacks.onError({ message: "Audio routing failed internally.", type: 'UNKNOWN' });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              callbacks.onTranscription(message.serverContent.inputTranscription.text, true);
            }
            if (message.serverContent?.outputTranscription) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text, false);
            }
            if (message.serverContent?.turnComplete) {
              callbacks.onTurnComplete();
            }
          },
          onerror: (e: any) => {
            console.error('Gemini Live Error:', e);
            if (this.sessionReady || this.isConnecting) {
              callbacks.onError({ 
                message: "A connection error occurred. Check your network.", 
                type: 'NETWORK' 
              });
            }
          },
          onclose: (e: CloseEvent) => {
            let error: GeminiError | null = null;
            
            if (e.code === 1006) {
              error = { message: "The connection dropped unexpectedly.", type: 'NETWORK' };
            } else if (e.code === 429) {
              error = { message: "API quota exceeded. Please slow down.", type: 'QUOTA' };
            } else if (e.code >= 400 && e.code < 500) {
              error = { message: `AI Service Error (${e.code}): ${e.reason || 'Invalid request'}`, type: 'API' };
            } else if (e.code >= 500) {
              error = { message: "Google's servers are currently struggling. Try again in a moment.", type: 'API' };
            }

            if (error && (this.sessionReady || this.isConnecting)) {
              callbacks.onError(error);
            }
            this.disconnect();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: "You are a professional voice-to-text transcription engine. Transcribe spoken words clearly."
        }
      });

      this.session = await sessionPromise;
      return this.session;

    } catch (error: any) {
      this.isConnecting = false;
      this.sessionReady = false;
      this.disconnect();
    }
  }

  async refineText(text: string): Promise<string> {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Format and punctuate this text. Keep it professional and verbatim: "${text}"`,
      });
      return response.text || text;
    } catch (err: any) {
      console.error("Refine failed", err);
      return text;
    }
  }

  disconnect() {
    this.isConnecting = false;
    this.sessionReady = false;
    if (this.scriptProcessor) { this.scriptProcessor.disconnect(); this.scriptProcessor = null; }
    if (this.stream) { this.stream.getTracks().forEach(track => track.stop()); this.stream = null; }
    if (this.audioContext && this.audioContext.state !== 'closed') { this.audioContext.close().catch(() => {}); this.audioContext = null; }
    if (this.session) { try { this.session.close(); } catch (e) {} this.session = null; }
  }
}

export const geminiService = new GeminiService();
