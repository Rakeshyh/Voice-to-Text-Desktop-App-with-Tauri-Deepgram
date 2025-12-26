
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppStatus, TranscriptionState, TranscriptItem } from './types';
import { geminiService, GeminiError } from './services/geminiService';
import { 
  MicrophoneIcon, 
  StopIcon, 
  ClipboardDocumentIcon, 
  TrashIcon, 
  SparklesIcon,
  ExclamationCircleIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  WifiIcon,
  InformationCircleIcon,
  XMarkIcon,
  RocketLaunchIcon,
  KeyIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

const MAX_AUTO_RETRIES = 2;

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [state, setState] = useState<TranscriptionState>({
    currentText: '',
    currentSpeaker: 'user',
    history: []
  });
  const [error, setError] = useState<GeminiError | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  
  const currentTranscriptionRef = useRef('');
  const currentSpeakerRef = useRef<'user' | 'model'>('user');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [state.currentText, state.history]);

  const commitCurrentToHistory = useCallback(() => {
    const text = currentTranscriptionRef.current.trim();
    if (text) {
      const newItem: TranscriptItem = {
        id: crypto.randomUUID(),
        text: text,
        timestamp: Date.now(),
        isFinal: true,
        speaker: currentSpeakerRef.current
      };
      setState(prev => ({
        ...prev,
        history: [...prev.history, newItem],
        currentText: ''
      }));
      currentTranscriptionRef.current = '';
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setStatus(AppStatus.RECORDING);
      currentTranscriptionRef.current = '';
      currentSpeakerRef.current = 'user';
      
      await geminiService.connectLive({
        onTranscription: (text, isInput) => {
          const speaker = isInput ? 'user' : 'model';
          if (speaker !== currentSpeakerRef.current) {
            commitCurrentToHistory();
            currentSpeakerRef.current = speaker;
          }
          currentTranscriptionRef.current += text;
          setState(prev => ({
            ...prev,
            currentSpeaker: speaker,
            currentText: currentTranscriptionRef.current
          }));
        },
        onTurnComplete: () => {
          commitCurrentToHistory();
        },
        onError: (err) => {
          console.error("Gemini Error:", err);
          setError(err);
          setStatus(AppStatus.ERROR);
          geminiService.disconnect();

          if (err.type === 'NETWORK' && retryCount < MAX_AUTO_RETRIES) {
            setRetryCount(prev => prev + 1);
            setTimeout(() => {
              if (status === AppStatus.RECORDING) startRecording();
            }, 1000);
          }
        }
      });
    } catch (err) {
      setStatus(AppStatus.IDLE);
    }
  }, [commitCurrentToHistory, retryCount, status]);

  const stopRecording = useCallback(() => {
    if (status === AppStatus.RECORDING) {
      geminiService.disconnect();
      commitCurrentToHistory();
      setStatus(AppStatus.IDLE);
      setState(prev => ({ ...prev, currentText: '' }));
      setRetryCount(0);
    }
  }, [commitCurrentToHistory, status]);

  const handleRetry = () => {
    setError(null);
    setRetryCount(0);
    setStatus(AppStatus.IDLE);
  };

  const handleRefine = async (id: string, text: string) => {
    setIsRefining(true);
    try {
      const refined = await geminiService.refineText(text);
      setState(prev => ({
        ...prev,
        history: prev.history.map(item => item.id === id ? { ...item, text: refined } : item)
      }));
    } catch (err) {
      console.error("Refinement failed", err);
    } finally {
      setIsRefining(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const clearHistory = () => {
    if (window.confirm("Clear all history?")) {
      setState({ currentText: '', currentSpeaker: 'user', history: [] });
    }
  };

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'NETWORK': return <WifiIcon className="w-5 h-5 text-amber-500" />;
      case 'QUOTA': return <ArrowPathIcon className="w-5 h-5 text-indigo-400 animate-spin" />;
      case 'PERMISSION': return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      default: return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto px-4 sm:px-6 bg-[#09090b]">
      {/* Deploy Guide Modal */}
      {showDeployGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <RocketLaunchIcon className="w-5 h-5 text-indigo-500" />
                <h2 className="text-lg font-bold text-white">Deployment Guide</h2>
              </div>
              <button onClick={() => setShowDeployGuide(false)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-widest">
                  <KeyIcon className="w-4 h-4" />
                  Step 1: Get API Key
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Go to <a href="https://aistudio.google.com/" target="_blank" className="text-indigo-500 hover:underline">Google AI Studio</a> and generate a free API key. This key powers the Gemini Live protocol and text refinement.
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-widest">
                  <GlobeAltIcon className="w-4 h-4" />
                  Step 2: Choose Host
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  FlowStream AI is a pure static ESM app. Deploy it to <b>Vercel</b>, <b>Netlify</b>, or <b>GitHub Pages</b> by uploading the repository or connecting your GitHub.
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-widest">
                  <SparklesIcon className="w-4 h-4" />
                  Step 3: Env Variables
                </div>
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-2 font-mono">Add this to your provider's dashboard:</p>
                  <code className="text-xs text-indigo-400 font-mono block">API_KEY=your_key_here</code>
                </div>
              </section>

              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl">
                <p className="text-xs text-amber-500 leading-relaxed font-medium">
                  Note: For microphone access to work, your deployed site <b>must</b> use HTTPS.
                </p>
              </div>
            </div>
            <div className="p-6 bg-zinc-950/50 border-t border-zinc-800">
              <button 
                onClick={() => setShowDeployGuide(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all"
              >
                Got it, Let's Go!
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="py-6 flex justify-between items-center border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">FlowStream AI</h1>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">v2.5 Live Stream</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {status === AppStatus.RECORDING && (
            <div className="hidden sm:flex items-center gap-2 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-bold text-red-500 uppercase">Live</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowDeployGuide(true)}
              className="p-2 text-zinc-500 hover:text-white transition-colors" 
              title="Deploy Guide"
            >
              <InformationCircleIcon className="w-5 h-5" />
            </button>
            <button onClick={clearHistory} className="p-2 text-zinc-500 hover:text-white transition-colors" title="Clear All">
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto py-8 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
        {state.history.length === 0 && !state.currentText && status === AppStatus.IDLE && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
            <MicrophoneIcon className="w-16 h-16 text-zinc-700 mb-4" />
            <h2 className="text-lg font-medium text-white">Hold to start flowing</h2>
            <p className="text-sm text-zinc-500 mt-1">Real-time AI transcription at your fingertips.</p>
          </div>
        )}

        {state.history.map((item) => (
          <div key={item.id} className={`flex flex-col gap-2 ${item.speaker === 'user' ? 'items-start' : 'items-end'}`}>
            <div className="flex items-center gap-2 px-1">
              {item.speaker === 'user' ? (
                <><UserCircleIcon className="w-4 h-4 text-zinc-600" /><span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">User</span></>
              ) : (
                <><span className="text-[9px] font-bold uppercase tracking-widest text-indigo-500">AI Assistant</span><ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-500" /></>
              )}
            </div>
            <div className={`group relative max-w-[85%] p-4 rounded-2xl border ${item.speaker === 'user' ? 'bg-zinc-900 border-zinc-800' : 'bg-indigo-950/20 border-indigo-500/20 text-right'}`}>
              <p className="text-base text-zinc-100 whitespace-pre-wrap">{item.text}</p>
              <div className={`mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${item.speaker === 'user' ? 'justify-start' : 'justify-end'}`}>
                <button onClick={() => handleRefine(item.id, item.text)} disabled={isRefining} className="p-1 text-zinc-500 hover:text-indigo-400"><SparklesIcon className="w-4 h-4" /></button>
                <button onClick={() => copyToClipboard(item.text)} className="p-1 text-zinc-500 hover:text-white"><ClipboardDocumentIcon className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}

        {state.currentText && (
          <div className={`flex flex-col gap-2 ${state.currentSpeaker === 'user' ? 'items-start' : 'items-end'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl border border-dashed animate-pulse ${state.currentSpeaker === 'user' ? 'bg-zinc-900/30 border-zinc-700' : 'bg-indigo-950/10 border-indigo-500/30'}`}>
              <p className="text-base text-zinc-500 italic">{state.currentText}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex gap-4">
              <div className="mt-1">{getErrorIcon(error.type)}</div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1 uppercase tracking-wider">
                  {error.type === 'NETWORK' ? 'Connection Issue' : error.type === 'QUOTA' ? 'Limit Reached' : 'System Error'}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">{error.message}</p>
                <button onClick={handleRetry} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-indigo-600/20">
                  <ArrowPathIcon className="w-3.5 h-3.5" /> Retry Now
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-10 flex flex-col items-center gap-6">
        <div className="relative">
          <button
            onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            disabled={status === AppStatus.ERROR}
            className={`
              relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
              active:scale-90 touch-none disabled:opacity-30 disabled:grayscale
              ${status === AppStatus.RECORDING ? 'bg-red-600' : 'bg-indigo-600 hover:bg-indigo-500 shadow-2xl shadow-indigo-600/30'}
            `}
          >
            {status === AppStatus.RECORDING ? <StopIcon className="w-12 h-12 text-white" /> : <MicrophoneIcon className="w-12 h-12 text-white" />}
          </button>
          {status === AppStatus.RECORDING && (
            <div className="absolute inset-0 bg-red-600 rounded-full animate-ping opacity-25"></div>
          )}
        </div>
        <div className="text-center h-4">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.3em]">
            {status === AppStatus.RECORDING ? 'Listening actively' : 'Hold space or button to speak'}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
