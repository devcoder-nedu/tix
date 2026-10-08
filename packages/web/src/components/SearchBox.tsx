// "Search all spaces" in the top bar: a combobox. Type to see matching issues,
// Arrow keys to move, Enter to open, Escape to clear. "/" focuses it from anywhere.

import { Search } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useSearch, useSpaces } from "../api/queries";
import { useShortcut } from "../lib/useShortcut";
import { IssueKey, StatusPill, TypeBadge } from "./IssueBits";

export function SearchBox() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const { data: results = [] } = useSearch(text);
  const { data: spaces = [] } = useSpaces();
  useShortcut("/", () => inputRef.current?.focus());

  const showList = open && text.trim().length > 0;
  const colorOf = (spaceId: number) => spaces.find((s) => s.id === spaceId)?.color ?? "#999";

  const go = (key: string) => {
    navigate(`/issue/${key}`);
    setText("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      go(results[highlight].key);
    } else if (e.key === "Escape") {
      setText("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-72">
      <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-ink-muted focus-within:border-accent">
        <Search size={16} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && results[highlight] ? `${listId}-${highlight}` : undefined
          }
          aria-label="Search all spaces"
          placeholder="Search all spaces"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHighlight(0); // new text, new results: start at the top
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
        <kbd className="rounded border border-line px-1.5 font-mono text-xs">/</kbd>
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 z-30 mt-1 w-[28rem] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
        >
          {results.map((issue, index) => (
            <li
              key={issue.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              // mousedown, not click: a click would blur the input first and close the list
              onMouseDown={(e) => {
                e.preventDefault();
                go(issue.key);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                index === highlight ? "bg-surface-2" : ""
              }`}
            >
              <TypeBadge type={issue.type} />
              <span className="w-20 shrink-0">
                <IssueKey issueKey={issue.key} color={colorOf(issue.spaceId)} />
              </span>
              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
              <StatusPill status={issue.status} />
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-ink-muted">No issues match "{text.trim()}"</li>
          )}
        </ul>
      )}
    </div>
  );
}
