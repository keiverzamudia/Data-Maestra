import * as React from 'react';
import type { RequestStatus } from '../../tipos';
import { WorkflowStepper } from './WorkflowStepper';

/**
 * 11B — Timeline legacy delegada al WorkflowStepper reutilizable.
 * Se conserva el nombre/props para los consumidores existentes.
 */
export const WorkflowTimeline: React.FC<{ status: RequestStatus }> = ({ status }) => {
  return <WorkflowStepper status={status} />;
};
