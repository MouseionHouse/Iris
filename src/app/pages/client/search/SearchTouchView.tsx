import React, { ChangeEventHandler, FormEventHandler, ReactNode, useRef } from 'react';
import { Icon, Icons, Text } from 'folds';
import classNames from 'classnames';
import { TouchIconButton } from '../../../features/room-nav/TouchList';
import * as touchCss from '../../../features/room-nav/touch.css';
import * as css from './SearchTouch.css';

/*
 * The look of the Search tab of a phone. Nothing here reads Matrix: `SearchTouch` finds the
 * rooms, and the mock page renders these on fake ones.
 */

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** The search key of the keyboard. */
  onSubmit: () => void;
};
/**
 * The field on top of the page. It does not take the focus on arrival: the keyboard would cover
 * the recent chats, which are what the page is opened for as often as not.
 */
export function SearchField({ value, onChange, onSubmit }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) =>
    onChange(evt.currentTarget.value);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    inputRef.current?.blur();
    onSubmit();
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <form className={css.SearchFieldForm} role="search" onSubmit={handleSubmit}>
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <label className={css.SearchField}>
        <Icon size="200" src={Icons.Search} />
        <input
          ref={inputRef}
          className={css.SearchFieldInput}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          placeholder="Search"
          aria-label="Search"
          value={value}
          onChange={handleChange}
        />
        {value ? (
          <TouchIconButton src={Icons.Cross} aria-label="Clear" onClick={handleClear} />
        ) : (
          <span className={css.SearchFieldEnd} />
        )}
      </label>
    </form>
  );
}

/** The name of a part of the list. */
export function SearchListLabel({ children }: { children: ReactNode }) {
  return (
    <div className={css.ListLabel}>
      <Text as="span" size="O400" priority="300" truncate>
        {children}
      </Text>
    </div>
  );
}

export function SearchListNote({ children }: { children: ReactNode }) {
  return (
    <div className={css.ListNote}>
      <Text size="T300" priority="300">
        {children}
      </Text>
    </div>
  );
}

type MessageSearchRowProps = {
  term: string;
  onClick: () => void;
};
/** The way from the chats into the messages: it carries the term over to message search. */
export function MessageSearchRow({ term, onClick }: MessageSearchRowProps) {
  return (
    <button type="button" className={touchCss.TouchRow} onClick={onClick}>
      <span className={touchCss.TouchRowAvatar}>
        <span className={classNames(touchCss.TouchRowIconTile, css.MessageSearchTile)}>
          <Icon size="200" src={Icons.Message} />
        </span>
      </span>
      <Text as="span" size="T400" className={css.MessageSearchLabel} truncate>
        Search messages for <b>{`“${term}”`}</b>
      </Text>
      <Icon size="100" src={Icons.ChevronRight} />
    </button>
  );
}
