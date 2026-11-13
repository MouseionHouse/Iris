import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';
import { IRIS_SOURCE_URL } from '../../sourceCode';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href={IRIS_SOURCE_URL} target="_blank" rel="noreferrer">
        Source code
      </Text>
      <Text as="a" size="T300" href="https://cinny.in" target="_blank" rel="noreferrer">
        Built on Cinny v4.12.6
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
