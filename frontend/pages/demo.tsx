// frontend/pages/demo.tsx
// Public demo landing page with selector

import React, { useState } from 'react';
import { DemoEmbed } from '../components/DemoEmbed';

type DemoType = 'core_platform' | 'ai_agents' | 'security' | 'government';

const DEMOS = [
  { id: 'core_platform' as DemoType, label: 'Core Platform', desc: 'AI-powered sprint management' },
  { id: 'ai_agents' as DemoType,     label: 'AI Agents',     desc: '37 intelligent automation agents' },
  { id: 'security' as DemoType,      label: 'Enterprise Security', desc: 'FedRAMP Moderate compliance' },
  { id: 'government' as DemoType,    label: 'Government',    desc: 'Federal agency compliance' },
];

export default function DemoPage() {
  const [selected, setSelected] = useState<DemoType>('core_platform');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1>Experience Agile Intel</h1>
        <p style={{ fontSize: 18, color: '#666' }}>Explore our interactive product demos</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16, marginBottom: 40,
      }}>
        {DEMOS.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(d.id)}
            style={{
              padding: 20,
              border: selected === d.id ? '2px solid #0066cc' : '1px solid #ddd',
              borderRadius: 8,
              background: selected === d.id ? '#f0f7ff' : '#fff',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <strong>{d.label}</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#666' }}>{d.desc}</p>
          </button>
        ))}
      </div>

      <DemoEmbed demoType={selected} height="700px" />

      <div style={{
        textAlign: 'center', marginTop: 40, padding: 30,
        background: '#f9f9f9', borderRadius: 8,
      }}>
        <h2>Ready to transform your agile workflow?</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>Schedule a personalized demo with our team</p>
        <a href="/demo-request" style={{
          display: 'inline-block', padding: '12px 32px',
          background: '#0066cc', color: '#fff', borderRadius: 4,
          fontWeight: 700, textDecoration: 'none',
        }}>
          Schedule Demo
        </a>
      </div>
    </div>
  );
}
