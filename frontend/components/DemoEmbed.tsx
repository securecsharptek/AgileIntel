// frontend/components/DemoEmbed.tsx
// Embeds a Supademo interactive demo via iframe

import React, { useState, useEffect } from 'react';

type DemoType = 'core_platform' | 'ai_agents' | 'security' | 'government';

interface DemoEmbedProps {
  demoType: DemoType;
  width?: string;
  height?: string;
  onLoad?: () => void;
}

const DEMO_URLS: Record<DemoType, string> = {
  core_platform: 'https://app.supademo.com/embed/agile-intel-core',
  ai_agents:     'https://app.supademo.com/embed/agile-intel-ai-agents',
  security:      'https://app.supademo.com/embed/agile-intel-security',
  government:    'https://app.supademo.com/embed/agile-intel-government',
};

export const DemoEmbed: React.FC<DemoEmbedProps> = ({
  demoType,
  width = '100%',
  height = '600px',
  onLoad,
}) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
  }, [demoType]);

  return (
    <div style={{ position: 'relative', width, minHeight: height }}>
      {isLoading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '16px', color: '#666',
        }}>
          Loading demo...
        </div>
      )}
      <iframe
        src={DEMO_URLS[demoType]}
        width={width}
        height={height}
        frameBorder="0"
        allowFullScreen
        onLoad={() => { setIsLoading(false); onLoad?.(); }}
        style={{
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
        title={`Agile Intel ${demoType.replace('_', ' ')} Demo`}
      />
    </div>
  );
};

export default DemoEmbed;
