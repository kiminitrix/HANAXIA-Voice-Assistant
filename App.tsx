
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SessionStatus } from './types';
import { HANAXIA_SYSTEM_PROMPT } from './constants';
import OrbVisualizer from './components/OrbVisualizer';
import { createBlob, decode, decodeAudioData } from './utils/audioUtils';

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    // Stop microphone
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
    }

    // Stop all audio sources
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();

    // Close contexts
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    
    setStatus(SessionStatus.IDLE);
    setIsModelSpeaking(false);
  }, []);

  const handleStart = async () => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setErrorMessage(null);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: HANAXIA_SYSTEM_PROMPT,
        },
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.ACTIVE);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            
            if (base64Audio) {
              setIsModelSpeaking(true);
              const audioCtx = outputAudioContextRef.current;
              if (audioCtx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
                
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                const gainNode = audioCtx.createGain();
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                source.addEventListener('ended', () => {
                  activeSourcesRef.current.delete(source);
                  if (activeSourcesRef.current.size === 0) {
                    setIsModelSpeaking(false);
                  }
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                activeSourcesRef.current.add(source);
              }
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Gemini Live Error:', e);
            setErrorMessage('Connection encountered an error.');
            cleanup();
          },
          onclose: () => {
            setStatus(SessionStatus.IDLE);
            cleanup();
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error('Failed to start session:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setStatus(SessionStatus.IDLE);
      cleanup();
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-white p-8 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/20 blur-[120px] rounded-full" />
      </div>

      <div className="z-10 flex flex-col items-center text-center max-w-xl">
        <h1 className="text-sm font-medium tracking-[0.3em] uppercase opacity-40 mb-12">
          HANAXIA SYSTEM
        </h1>
        
        <OrbVisualizer status={status} isModelSpeaking={isModelSpeaking} />

        <div className="mt-16 space-y-4">
          {status === SessionStatus.IDLE && (
            <button
              onClick={handleStart}
              className="px-10 py-4 bg-white text-black rounded-full font-semibold text-lg hover:bg-opacity-90 transition-all active:scale-95 shadow-2xl shadow-white/10"
            >
              Start Conversation
            </button>
          )}

          {status === SessionStatus.CONNECTING && (
            <div className="text-white/40 animate-pulse">Initializing Neural Link...</div>
          )}

          {status === SessionStatus.ACTIVE && (
            <button
              onClick={cleanup}
              className="px-8 py-3 border border-white/20 rounded-full font-medium hover:bg-white/5 transition-all text-white/60"
            >
              Disconnect
            </button>
          )}

          {errorMessage && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        {status === SessionStatus.ACTIVE && (
          <div className="mt-8 text-xs font-mono text-white/30 uppercase tracking-widest animate-pulse">
            {isModelSpeaking ? 'Transmitting Response' : 'Listening...'}
          </div>
        )}
      </div>

      <div className="absolute bottom-8 text-[10px] text-white/10 uppercase tracking-[0.2em]">
        Voice-Only Protocol v2.5.0
      </div>
    </div>
  );
};

export default App;
