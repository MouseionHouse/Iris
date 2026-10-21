import React, { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  SidebarSection,
  canDropRoom,
  dropRoomTag,
  moveSectionTo,
  sectionDropIndex,
} from '../../state/sidebar';
import * as css from './sidebarDrag.css';

/*
 * Dragging in Home's sidebar (desktop): a section header drags to a new place among the sections,
 * and a room row drags onto another section. The list is virtual, so each tile registers itself
 * while it is mounted and one monitor decides what a drop does.
 */

const SECTION = 'sidebar-section';
const ROOM = 'sidebar-room';

type SectionSource = { type: typeof SECTION; tag: string };
type RoomSource = { type: typeof ROOM; roomId: string; direct: boolean; fromTag: string };

/** What the sidebar shows while something is dragged over it. */
export type SidebarDragState = {
  /** The tag of the section being dragged, or of the section a room is dragged from. */
  from?: string;
  /** A section a room would drop on: its header and rows light up. */
  highlight?: string;
  /** A section drop: the line goes above or below this section. */
  line?: { tag: string; after: boolean };
};

const IDLE: SidebarDragState = {};

type Target = { tag: string; header: boolean; after: boolean };

const readTarget = (data: Record<string | symbol, unknown>): Target => ({
  tag: data.tag as string,
  header: data.header as boolean,
  after: extractClosestEdge(data) !== 'top',
});

type SidebarDragOptions = {
  scrollRef: RefObject<HTMLElement>;
  enabled: boolean;
  sections: SidebarSection[];
  save: (sections: SidebarSection[]) => unknown;
  moveRoom: (roomId: string, tag: string | undefined) => unknown;
};

/** The drop decision and the auto-scroll of the list; the state says what to draw. */
export function useSidebarDrag({
  scrollRef,
  enabled,
  sections,
  save,
  moveRoom,
}: SidebarDragOptions): SidebarDragState {
  const [state, setState] = useState<SidebarDragState>(IDLE);
  // The monitor stays registered through a drag; it reads the latest of these.
  const latest = useRef({ sections, save, moveRoom });
  latest.current = { sections, save, moveRoom };

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!enabled || !scrollElement) return undefined;

    // Where a section dropped on this target lands; -1 when that changes nothing.
    const sectionDrop = (source: SectionSource, target: Target): number => {
      const list = latest.current.sections;
      // Rows are not edges of their own: a section dropped on them lands after theirs.
      const after = target.header ? target.after : true;
      const to = sectionDropIndex(list, source.tag, target.tag, after);
      return moveSectionTo(list, source.tag, to) === list ? -1 : to;
    };

    const read = (
      source: Record<string | symbol, unknown>,
      targets: { data: Record<string | symbol, unknown> }[]
    ): SidebarDragState => {
      if (source.type === SECTION) {
        const s = source as SectionSource;
        const first = targets[0];
        if (!first) return { from: s.tag };
        const target = readTarget(first.data);
        if (sectionDrop(s, target) < 0) return { from: s.tag };
        return { from: s.tag, line: { tag: target.tag, after: target.after || !target.header } };
      }
      const r = source as RoomSource;
      const first = targets[0];
      return { from: r.fromTag, highlight: first ? (first.data.tag as string) : undefined };
    };
    const show = (next: SidebarDragState) =>
      setState((prev) =>
        prev.from === next.from &&
        prev.highlight === next.highlight &&
        prev.line?.tag === next.line?.tag &&
        prev.line?.after === next.line?.after
          ? prev
          : next
      );

    return combine(
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === SECTION || source.data.type === ROOM,
        onDragStart: ({ source, location }) =>
          show(read(source.data, location.current.dropTargets)),
        onDrag: ({ source, location }) => show(read(source.data, location.current.dropTargets)),
        onDrop: ({ source, location }) => {
          setState(IDLE);
          const [first] = location.current.dropTargets;
          if (!first) return;
          const target = readTarget(first.data);
          if (source.data.type === SECTION) {
            const s = source.data as SectionSource;
            const to = sectionDrop(s, target);
            if (to >= 0) latest.current.save(moveSectionTo(latest.current.sections, s.tag, to));
            return;
          }
          const r = source.data as RoomSource;
          if (canDropRoom(r.direct, r.fromTag, target.tag)) {
            latest.current.moveRoom(r.roomId, dropRoomTag(target.tag));
          }
        },
      }),
      autoScrollForElements({ element: scrollElement })
    );
  }, [scrollRef, enabled]);

  return state;
}

type SidebarDragTileProps = {
  /** The section this header or row belongs to. */
  tag: string;
  /** A section header; otherwise a room row. Both drag. */
  header?: boolean;
  roomId?: string;
  direct?: boolean;
  drag: SidebarDragState;
  /** This tile is the first or the last of its section, where the section drop line is drawn. */
  first?: boolean;
  last?: boolean;
  children: ReactNode;
};

/** Wraps a header or a room row of the list: it is what is dragged and what is dropped on. */
export function SidebarDragTile({
  tag,
  header,
  roomId,
  direct,
  drag,
  first,
  last,
  children,
}: SidebarDragTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const source: SectionSource | RoomSource = header
      ? { type: SECTION, tag }
      : { type: ROOM, roomId: roomId ?? '', direct: !!direct, fromTag: tag };
    return combine(
      draggable({
        element,
        getInitialData: () => source,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source: dragged }) => {
          if (dragged.data.type === SECTION) return dragged.data.tag !== tag;
          if (dragged.data.type !== ROOM) return false;
          const r = dragged.data as RoomSource;
          return canDropRoom(r.direct, r.fromTag, tag);
        },
        getData: ({ input, element: el }) =>
          attachClosestEdge(
            { tag, header: !!header },
            { input, element: el, allowedEdges: ['top', 'bottom'] }
          ),
      })
    );
  }, [tag, header, roomId, direct]);

  const sectionLine = drag.line?.tag === tag ? drag.line : undefined;
  return (
    <div
      ref={ref}
      className={classNames(
        css.DragTile,
        dragging && css.Dragging,
        drag.highlight === tag && css.Highlight,
        sectionLine && first && !sectionLine.after && css.LineBefore,
        sectionLine && last && sectionLine.after && css.LineAfter
      )}
    >
      {children}
    </div>
  );
}
