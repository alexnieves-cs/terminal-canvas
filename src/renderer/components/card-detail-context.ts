import { createContext } from 'react'
import type { CardDetail } from '@renderer/canvas/card-detail'

/**
 * M69. The current far-view tier, provided once by Canvas at the world layer
 * and read by PanelFrame — so every kind renders `edge · title · state` below
 * SUMMARY_ENTER and a block below BLOCK_ENTER without five components each
 * threading a prop. A terminal keeps its own three tiers (TerminalPanel reads
 * the prop it always did); the frame's tiers are for the kinds that had none.
 */
export const CardDetailContext = createContext<CardDetail>('tail')
