/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useId } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { StateGraph } from "./basecardlifecycle";

type Point = { x: number; y: number };

export type StateDiagramLayout<StateId extends string> = {
    width?: number;
    height?: number;
    nodeWidth: number;
    nodeHeight: number;
    fontSize?: number;
    positions: Partial<Record<StateId, Point>>;
    edgePaths?: readonly { from: StateId; to: StateId; path: string }[];
};

type Props<StateId extends string, BaseLifecycle extends string> = {
    graph: StateGraph<StateId, BaseLifecycle>;
    currentState: StateId;
    layout?: StateDiagramLayout<StateId>;
    ariaLabel?: string;
    nodeTone?: Partial<Record<StateId, "success" | "warning">>;
    dashedNodes?: ReadonlySet<StateId>;
};

const defaultNodeWidth = 132;
const defaultNodeHeight = 48;

export default function StateDiagram<StateId extends string, BaseLifecycle extends string>({
    graph,
    currentState,
    layout,
    ariaLabel,
    nodeTone,
    dashedNodes,
}: Props<StateId, BaseLifecycle>) {
    const theme = useTheme();
    const markerId = `state-diagram-arrow-${useId().replace(/:/g, "")}`;
    const states = Object.keys(graph) as StateId[];
    const nodeWidth = layout?.nodeWidth ?? defaultNodeWidth;
    const nodeHeight = layout?.nodeHeight ?? defaultNodeHeight;
    const horizontalGap = 72;
    const verticalGap = 48;
    const padding = 32;
    const incoming = new Set(states.flatMap((state) => graph[state].transitions));
    const roots = states.filter((state) => !incoming.has(state));
    const ranks = new Map<StateId, number>();

    function assignReachable(startStates: readonly StateId[], startRank: number) {
        const queue = startStates.filter((state) => !ranks.has(state)).map((state) => ({ state, rank: startRank }));
        queue.forEach(({ state, rank }) => ranks.set(state, rank));
        for (let index = 0; index < queue.length; index += 1) {
            const { state, rank } = queue[index];
            graph[state].transitions.forEach((nextState) => {
                if (ranks.has(nextState)) return;
                ranks.set(nextState, rank + 1);
                queue.push({ state: nextState, rank: rank + 1 });
            });
        }
    }

    assignReachable(roots.length ? roots : states.slice(0, 1), 0);
    states.forEach((state) => {
        if (ranks.has(state)) return;
        const nextRank = ranks.size ? Math.max(...ranks.values()) + 1 : 0;
        assignReachable([state], nextRank);
    });

    const layers = new Map<number, StateId[]>();
    states.forEach((state) => {
        const rank = ranks.get(state)!;
        layers.set(rank, [...(layers.get(rank) ?? []), state]);
    });
    const layerCount = layers.size;
    const largestLayer = Math.max(1, ...[...layers.values()].map((layer) => layer.length));
    const width = layout?.width ?? padding * 2 + layerCount * nodeWidth + Math.max(0, layerCount - 1) * horizontalGap;
    const height = layout?.height ?? padding * 2 + largestLayer * nodeHeight + Math.max(0, largestLayer - 1) * verticalGap;
    const positions = new Map<StateId, Point>();
    layers.forEach((layer, rank) => {
        const layerHeight = layer.length * nodeHeight + Math.max(0, layer.length - 1) * verticalGap;
        layer.forEach((state, index) => {
            positions.set(state, {
                x: padding + nodeWidth / 2 + rank * (nodeWidth + horizontalGap),
                y: (height - layerHeight) / 2 + nodeHeight / 2 + index * (nodeHeight + verticalGap),
            });
        });
    });
    states.forEach((state) => {
        const customPosition = layout?.positions[state];
        if (customPosition) positions.set(state, customPosition);
    });
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
            <Box sx={{ overflowX: "auto" }}>
                <Box sx={{ minWidth: width, width, maxWidth: "100%" }}>
                    <svg
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        role="img"
                        aria-label={ariaLabel ?? `State graph. Current state: ${graph[currentState].label}. ${description}`}
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
                                strokeDasharray={dashedNodes?.has(from) ? "5 4" : undefined}
                                markerEnd={`url(#${markerId})`}
                            />
                        ))}
                        {states.map((state) => {
                            const { x, y } = positions.get(state)!;
                            const isCurrent = state === currentState;
                            const tone = nodeTone?.[state];
                            const solid = isCurrent ? theme.palette[tone ?? "primary"] : null;
                            return (
                                <g key={state} data-state={state} aria-current={isCurrent ? "true" : undefined}>
                                    <title>{`${graph[state].label}; BaseCard lifecycle: ${graph[state].baseCardLifecycle}`}</title>
                                    <rect
                                        x={x - nodeWidth / 2}
                                        y={y - nodeHeight / 2}
                                        width={nodeWidth}
                                        height={nodeHeight}
                                        rx={6}
                                        fill={solid ? solid.main : tone ? alpha(theme.palette[tone].main, 0.16) : theme.palette.background.paper}
                                        stroke={solid ? solid.main : tone ? theme.palette[tone].main : theme.palette.divider}
                                        strokeWidth={isCurrent ? 2 : 1}
                                        strokeDasharray={dashedNodes?.has(state) ? "5 4" : undefined}
                                    />
                                    <text
                                        x={x}
                                        y={y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill={solid ? solid.contrastText : theme.palette.text.primary}
                                        fontSize={layout?.fontSize ?? 14}
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