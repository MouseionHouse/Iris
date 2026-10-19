import { as, Box, Text } from 'folds';
import React, { ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './styles.css';

export const getDOMGroupId = (id: string): string => `EmojiBoardGroup-${id}`;

export const EmojiGroup = as<
  'div',
  {
    id: string;
    label: string;
    children: ReactNode;
    /** Actions beside the label; the label then sits at the start of the header. */
    after?: ReactNode;
    dimmed?: boolean;
  }
>(({ className, id, label, children, after, dimmed, ...props }, ref) => {
  const labelEl = (
    <Text
      id={`EmojiGroup-${id}-label`}
      as="label"
      className={after ? css.EmojiGroupHeaderLabel : css.EmojiGroupLabel}
      size="O400"
      truncate={!!after}
    >
      {label}
    </Text>
  );

  return (
    <Box
      id={getDOMGroupId(id)}
      data-group-id={id}
      className={classNames(css.EmojiGroup, className)}
      direction="Column"
      gap="200"
      {...props}
      ref={ref}
    >
      {after ? (
        <Box className={css.EmojiGroupHeader} alignItems="Center" gap="100">
          {labelEl}
          <Box grow="Yes" />
          {after}
        </Box>
      ) : (
        labelEl
      )}
      <div
        aria-labelledby={`EmojiGroup-${id}-label`}
        className={classNames(css.EmojiGroupContent, dimmed && css.EmojiGroupDimmed)}
      >
        <Box wrap="Wrap" justifyContent="Center">
          {children}
        </Box>
      </div>
    </Box>
  );
});
