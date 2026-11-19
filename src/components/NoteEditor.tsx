import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Bold, Italic, Heading2, List, ListChecks, Code, Link2 } from "lucide-react";

export type NoteChange = { note: string; noteText: string; checklistTotal: number; checklistDone: number };

function countChecklist(doc: JSONContent): { total: number; done: number } {
  let total = 0,
    done = 0;
  const walk = (n: JSONContent) => {
    if (n.type === "taskItem") {
      total++;
      if (n.attrs?.checked) done++;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return { total, done };
}

function parseInitial(note: string | undefined): JSONContent | string {
  if (!note) return "";
  try {
    return JSON.parse(note) as JSONContent;
  } catch {
    return note;
  }
}

export function NoteEditor({ initial, onChange }: { initial: string | undefined; onChange: (c: NoteChange) => Promise<unknown> }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<NoteChange | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const flush = async () => {
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    setStatus("saving");
    try {
      await onChangeRef.current(change);
      setStatus("saved");
    } catch {
      setStatus("error");
      // Réessaie avec la version la plus récente.
      if (!pending.current) pending.current = change;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 3000);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: true, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Notes, compte rendu, sous-tâches… (tapez [ ] pour une case à cocher)" }),
    ],
    content: parseInitial(initial),
    immediatelyRender: true,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const { total, done } = countChecklist(json);
      pending.current = {
        note: JSON.stringify(json),
        noteText: editor.getText({ blockSeparator: "\n" }),
        checklistTotal: total,
        checklistDone: done,
      };
      setStatus("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 700);
    },
  });

  // Enregistre ce qui reste en attente quand on referme la note.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="note-editor">
      {editor && <Toolbar editor={editor} status={status} />}
      <EditorContent editor={editor} className="pt-2 text-[15px] leading-relaxed" />
    </div>
  );
}

function Toolbar({ editor, status }: { editor: Editor; status: "idle" | "saving" | "saved" | "error" }) {
  const btn = (label: string, active: boolean, run: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`grid size-8 place-items-center rounded-full transition-colors duration-150 ${active ? "bg-accent text-white" : "text-ink-2 hover:bg-hover"}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line pb-1.5">
      {btn("Gras", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), Bold)}
      {btn("Italique", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), Italic)}
      {btn("Titre", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
      {btn("Liste à puces", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), List)}
      {btn("Cases à cocher", editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), ListChecks)}
      {btn("Code", editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), Code)}
      {btn("Lien", editor.isActive("link"), setLink, Link2)}
      <span className="ml-auto pr-1 text-[11px] text-ink-2" aria-live="polite">
        {status === "saving" ? "Enregistrement…" : status === "saved" ? "Enregistré" : status === "error" ? <span className="text-ink">Échec, réessai…</span> : ""}
      </span>
    </div>
  );
}
