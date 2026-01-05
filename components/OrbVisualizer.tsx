
import React from 'react';
import { SessionStatus } from '../types';

interface OrbVisualizerProps {
  status: SessionStatus;
  isModelSpeaking: boolean;
}

const OrbVisualizer: React.FC<OrbVisualizerProps> = ({ status, isModelSpeaking }) => {
  const getOrbStateClass = () => {
    if (status === SessionStatus.ACTIVE) {
      return isModelSpeaking ? 'scale-110 shadow-[0_0_100px_rgba(139,92,246,0.6)]' : 'listening scale-100 shadow-[0_0_60px_rgba(79,70,229,0.4)]';
    }
    if (status === SessionStatus.CONNECTING) return 'animate-pulse opacity-40';
    return 'opacity-20 grayscale';
  };

  return (
    <div className="orb-container flex items-center justify-center relative">
      <div className={`orb transition-all duration-700 ease-in-out ${getOrbStateClass()}`} />
      
      {/* Decorative Rings */}
      <div className={`absolute w-[400px] h-[400px] border border-white/5 rounded-full transition-all duration-1000 ${status === SessionStatus.ACTIVE ? 'scale-100' : 'scale-75'}`} />
      <div className={`absolute w-[500px] h-[500px] border border-white/5 rounded-full transition-all duration-1000 delay-200 ${status === SessionStatus.ACTIVE ? 'scale-100' : 'scale-75'}`} />
    </div>
  );
};

export default OrbVisualizer;
