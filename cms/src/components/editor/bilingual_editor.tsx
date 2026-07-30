'use client';

// BilingualEditor — éditeur WYSIWYG bilingue FR/EN (Phase 11 bis).
//
// Utilise TipTap (StarterKit + Link + Placeholder). Deux onglets
// pour la langue (FR/EN), un éditeur par côté. Sauvegarde via
// callback onChange.
//
// Note : on n'utilise PAS `@tiptap/extension-character-count` pour
// rester léger. La validation de longueur est faite côté backend
// (Zod).

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@radix-ui/react-tabs';
import { Bold, Italic, List, Link as LinkIcon } from 'lucide-react';

export interface BilingualValue {
  fr: string;
  en: string;
}

interface Props {
  value: BilingualValue;
  onChange: (v: BilingualValue) => void;
  placeholderFr?: string;
  placeholderEn?: string;
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex gap-1 border-b border-slate-200 p-2 bg-slate-50">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('bold') ? 'bg-slate-200' : ''}`}
        title="Gras"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('italic') ? 'bg-slate-200' : ''}`}
        title="Italique"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('bulletList') ? 'bg-slate-200' : ''}`}
        title="Liste"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt('URL du lien');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('link') ? 'bg-slate-200' : ''}`}
        title="Lien"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function BilingualEditor({ value, onChange, placeholderFr, placeholderEn }: Props) {
  const [active, setActive] = useState<'fr' | 'en'>('fr');
  const frEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholderFr ?? 'Texte en français…' }),
    ],
    content: value.fr,
    onUpdate: ({ editor }) => {
      onChange({ fr: editor.getHTML(), en: value.en });
    },
    immediatelyRender: false,
  });
  const enEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholderEn ?? 'English text…' }),
    ],
    content: value.en,
    onUpdate: ({ editor }) => {
      onChange({ fr: value.fr, en: editor.getHTML() });
    },
    immediatelyRender: false,
  });

  // Sync external value → editor.
  useEffect(() => {
    if (frEditor && value.fr !== frEditor.getHTML()) {
      frEditor.commands.setContent(value.fr || '', { emitUpdate: false });
    }
  }, [value.fr, frEditor]);
  useEffect(() => {
    if (enEditor && value.en !== enEditor.getHTML()) {
      enEditor.commands.setContent(value.en || '', { emitUpdate: false });
    }
  }, [value.en, enEditor]);

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as 'fr' | 'en')}>
      <TabsList className="flex border-b border-slate-200">
        <TabsTrigger
          value="fr"
          className={`px-4 py-2 text-sm font-medium ${active === 'fr' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500'}`}
        >
          Français
        </TabsTrigger>
        <TabsTrigger
          value="en"
          className={`px-4 py-2 text-sm font-medium ${active === 'en' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500'}`}
        >
          English
        </TabsTrigger>
      </TabsList>
      <TabsContent value="fr" className="border border-t-0 border-slate-200 rounded-b-md">
        <Toolbar editor={frEditor} />
        <div className="p-3 min-h-[150px] prose prose-sm max-w-none">
          <EditorContent editor={frEditor} />
        </div>
      </TabsContent>
      <TabsContent value="en" className="border border-t-0 border-slate-200 rounded-b-md">
        <Toolbar editor={enEditor} />
        <div className="p-3 min-h-[150px] prose prose-sm max-w-none">
          <EditorContent editor={enEditor} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
