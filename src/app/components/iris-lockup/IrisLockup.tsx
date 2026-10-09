import React from 'react';
import classNames from 'classnames';
import { toRem } from 'folds';
import MarkOnLight from '../../../../public/res/svg/iris-mark-on-light.svg';
import MarkOnDark from '../../../../public/res/svg/iris-mark-on-dark.svg';

type IrisLockupProps = {
  /** The size of the name's type in px. The mark and the gap are sized from it. */
  size: number;
  className?: string;
};

/**
 * The mark and the name Iris, side by side: the one way the two are shown together (John,
 * 2026-10-09; never the mark above the name). Both marks are in the page and the theme's class
 * shows the one drawn for its ground (`.iris-lockup` in src/index.css), so it also works before
 * sign-in, where there is no theme context.
 */
export function IrisLockup({ size, className }: IrisLockupProps) {
  return (
    <span className={classNames('iris-lockup', className)} style={{ fontSize: toRem(size) }}>
      <img className="iris-lockup-mark iris-on-light" src={MarkOnLight} alt="" />
      <img className="iris-lockup-mark iris-on-dark" src={MarkOnDark} alt="" />
      <span className="iris-name">Iris</span>
    </span>
  );
}
