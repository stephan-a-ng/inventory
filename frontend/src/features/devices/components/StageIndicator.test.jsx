import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import StageIndicator from './StageIndicator';

const STAGES = [
  { id: 's1', name: 'Assembly' },
  { id: 's2', name: 'Firmware' },
  { id: 's3', name: 'QA' },
  { id: 's4', name: 'Deployed' },
];

describe('<StageIndicator />', () => {
  it('renders "Unassigned" when stages array is empty', () => {
    render(<StageIndicator stages={[]} currentStageId={null} />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it('renders "Unassigned" when currentStageId is null', () => {
    render(<StageIndicator stages={STAGES} currentStageId={null} />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it('renders "Unassigned" when currentStageId is unknown', () => {
    render(<StageIndicator stages={STAGES} currentStageId="bogus" />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it('shows the current stage name and its position', () => {
    render(<StageIndicator stages={STAGES} currentStageId="s2" />);
    // "Firmware" appears twice — once in the title, once in the strip below.
    expect(screen.getAllByText('Firmware').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('renders the full pipeline of stage names', () => {
    render(<StageIndicator stages={STAGES} currentStageId="s2" />);
    for (const s of STAGES) {
      const matches = screen.getAllByText(s.name);
      expect(matches.length).toBeGreaterThan(0);
    }
  });
});
