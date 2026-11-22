/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useId } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import type { StateGraph } from "./basecardlifecycle";

type Point = { x: number; y: number };

export type StateDiagramLayout<StateId extends string> = {
    width: number;
    height: number;
    nodeWidth: number;
    nodeHeight: number;
    positions: Partial<Record<StateId, Point>>;
    edgePaths?: readonly { from: StateId; to: StateId; path: string }[];
};

type Props<StateId extends string, BaseLifecycle extends string> = {
    graph: StateGraph<StateId, BaseLifecycle>;
    currentState: StateId;
    layout?: StateDiagramLayout<StateId>;
};

const defaultNodeWidth = 132;
const defaultNodeHeight = 48;

export default function StateDiagram<StateId extends string, BaseLifecycle extends string>({
    graph,
    currentState,
    layout,
}: Props<StateId, BaseLifecycle>) {
    const theme = useTheme();
    const markerId = `state-diagram-arrow-${useId().replace(/:/g, "")}`;
    const states = Object.keys(graph) as StateId[];
    const radiusX = Math.max(350, states.length * 44);
    const radiusY = Math.max(140, states.length * 17);
    const nodeWidth = layout?.nodeWidth ?? defaultNodeWidth;
    const nodeHeight = layout?.nodeHeight ?? defaultNodeHeight;
    const width = layout?.width ?? radiusX * 2 + nodeWidth + 48;
    const height = layout?.height ?? radiusY * 2 + nodeHeight + 48;
    const center = { x: width / 2, y: height / 2 };
    const positions = new Map<StateId, Point>(states.map((state, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / states.length;
        return [state, layout?.positions[state] ?? { x: center.x + radiusX * Math.cos(angle), y: center.y + radiusY * Math.sin(angle) }];
    }));
    const indexByState = new Map(states.map((state, index) => [state, index]));
    const edgePaths = new Map(layout?.edgePaths?.map(({ from, to, path }) => [`${from}-${to}`, path]));
    const transitions = states.flatMap((from) => graph[from].transitions.map((to) => ({ from, to })));
    const description = states.map((state) => {
        const nextStates = graph[state].transitions.map((nextState) => graph[nextState].label);
        return `${graph[state].label} transitions to ${nextStates.length ? nextStates.join(", ") : "no states"}`;
    }).join(". ");

    function edgePath(from: StateId, to: StateId): string {
        const layoutPath = edgePaths.get(`${from}-${to}`);
        if (layoutPath) return layoutPath;

        const start = positions.get(from)!;
        const end = positions.get(to)!;
        if (from === to) {
            return `M ${start.x - 18} ${start.y - 20} C ${start.x - 70} ${start.y - 90}, ${start.x + 70} ${start.y - 90}, ${start.x + 18} ${start.y - 20}`;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        const unitX = dx / distance;
        const unitY = dy / distance;
        const inset = Math.min(
            nodeWidth / 2 / Math.max(Math.abs(unitX), Number.EPSILON),
            nodeHeight / 2 / Math.max(Math.abs(unitY), Number.EPSILON),
        );
        const startX = start.x + unitX * inset;
        const startY = start.y + unitY * inset;
        const endX = end.x - unitX * inset;
        const endY = end.y - unitY * inset;
        const isReverseEdge = graph[to].transitions.includes(from);
        if (!isReverseEdge) return `M ${startX} ${startY} L ${endX} ${endY}`;

        const offset = (indexByState.get(from)! < indexByState.get(to)! ? 20 : -20);
        const controlX = (startX + endX) / 2 - unitY * offset;
        const controlY = (startY + endY) / 2 + unitX * offset;
        return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    }

    return (
        <Box sx={{ mb: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>State graph</Typography>
            <Box sx={{ overflowX: "auto" }}>
                <Box sx={{ minWidth: width, width, maxWidth: "100%" }}>
                    <svg
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        role="img"
                        aria-label={`State graph. Current state: ${graph[currentState].label}. ${description}`}
                    >
                        <defs>
                            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                                <path d="M0 0 L10 5 L0 10 Z" fill={theme.palette.text.secondary} />
                            </marker>
                        </defs>
                        {transitions.map(({ from, to }) => (
                            <path
                                key={`${from}-${to}`}
                                data-from={from}
                                data-to={to}
                                d={edgePath(from, to)}
                                fill="none"
                                stroke={from === currentState ? theme.palette.primary.main : theme.palette.divider}
                                strokeWidth={from === currentState ? 2 : 1.5}
                                markerEnd={`url(#${markerId})`}
                            />
                        ))}
                        {states.map((state) => {
                            const { x, y } = positions.get(state)!;
                            const isCurrent = state === currentState;
                            return (
                                <g key={state} data-state={state} aria-current={isCurrent ? "true" : undefined}>
                                    <title>{`${graph[state].label}; BaseCard lifecycle: ${graph[state].baseCardLifecycle}`}</title>
                                    <rect
                                        x={x - nodeWidth / 2}
                                        y={y - nodeHeight / 2}
                                        width={nodeWidth}
                                        height={nodeHeight}
                                        rx={6}
                                        fill={isCurrent ? theme.palette.primary.main : theme.palette.background.paper}
                                        stroke={isCurrent ? theme.palette.primary.main : theme.palette.divider}
                                        strokeWidth={isCurrent ? 2 : 1}
                                    />
                                    <text
                                        x={x}
                                        y={y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill={isCurrent ? theme.palette.primary.contrastText : theme.palette.text.primary}
                                        fontSize="14"
                                    >
                                        {graph[state].label}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </Box>
            </Box>
        </Box>
    );
}