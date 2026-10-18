import React, { ReactNode } from 'react';
import { Box } from 'folds';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

type ClientLayoutProps = {
  nav: ReactNode;
  /** The bar of a phone, which has no room for the rail beside the page. */
  bottomNav?: ReactNode;
  /** The strip of a call that is going on in another room. */
  callStatus?: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, bottomNav, callStatus, children }: ClientLayoutProps) {
  const screenSize = useScreenSizeContext();

  if (screenSize === ScreenSize.Mobile) {
    return (
      <Box grow="Yes" direction="Column">
        <Box grow="Yes" style={{ minHeight: 0 }}>
          {children}
        </Box>
        {/* above the bar: the bar is the bottom of the screen and paints the gesture area under it */}
        {callStatus}
        {bottomNav}
      </Box>
    );
  }

  return (
    <>
      <Box grow="Yes">
        <Box shrink="No">{nav}</Box>
        <Box grow="Yes">{children}</Box>
      </Box>
      {callStatus}
    </>
  );
}
