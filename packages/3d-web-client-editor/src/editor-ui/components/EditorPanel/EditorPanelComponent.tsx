import { html } from "@codemirror/lang-html";
import CodeMirror, { BasicSetupOptions } from "@uiw/react-codemirror";
import React, {
  useRef,
  useEffect,
  useState,
  ForwardedRef,
  useImperativeHandle,
  useCallback,
} from "react";

import { useClickOutside } from "../../helpers";

import styles from "./EditorPanelComponent.module.css";
import { editorTheme } from "./theme";

type EditorPanelProps = {
  onUpdate: (content: string) => void;
  visible: boolean;
  holderElement: HTMLElement;
};

export interface EditorPanelHandle {
  setVisible: (visible: boolean) => void;
}

const EditorPanelComponent = (props: EditorPanelProps, ref: ForwardedRef<EditorPanelHandle>) => {
  const [isVisible, setIsVisible] = useState<boolean>(props.visible ?? false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [editorValue, setEditorValue] = useState<string>("");
  const [documentList, setDocumentList] = useState<string[]>([]);
  const [documentsWithCopies, setDocumentsWithCopies] = useState<string[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string>("");

  const { onUpdate } = props;

  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useClickOutside(() => {
    props.visible = false;
    setIsVisible(false);
  });

  // Fetch list of documents
  const fetchDocumentList = async () => {
    try {
      const response = await fetch("/mml-documents-list");
      const data = await response.json();
      setDocumentList(data.documents);

      // Fetch list of documents with copies
      const copiesResponse = await fetch("/mml-documents-copies");
      const copiesData = await copiesResponse.json();
      setDocumentsWithCopies(copiesData.documents);
    } catch (error) {
      console.error("Error fetching document list:", error);
    }
  };

  // Fetch the content of a selected document
  const fetchDocumentContent = async (docName: string) => {
    try {
      const response = await fetch(`/mml-documents/${docName}`);
      const data = await response.json();
      setEditorValue(data.content);
      setSelectedDocument(docName);
    } catch (error) {
      console.error("Error fetching document:", error);
    }
  };

  // Save the document content
  const saveDocument = useCallback(async (content: string, docName: string) => {
    try {
      const response = await fetch(`/mml-documents/${docName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const result = await response.json();

      // Refresh document list and content after save
      await fetchDocumentList();
      await fetchDocumentContent(docName);
    } catch (error) {
      console.error("Error saving document:", error);
    }
  }, []);

  // Restore the original document from its copy
  const restoreDocument = async (docName: string) => {
    try {
      const response = await fetch(`/mml-documents/${docName}/restore`, {
        method: "POST",
      });
      const result = await response.json();
      console.log(result.message);

      // Refresh the document content and list after restoration
      await fetchDocumentContent(docName);
      await fetchDocumentList();
    } catch (error) {
      console.error("Error restoring document:", error);
    }
  };

  useEffect(() => {
    const editorElement = editorRef.current;
    if (editorElement) {
      const stopPropagation = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsVisible(!isVisible);
        }
        if (e.altKey && e.key === "Enter") {
          const trimmedValue = editorValue.trim();
          onUpdate(trimmedValue);
          saveDocument(trimmedValue, selectedDocument);
        }
        e.stopPropagation();
      };

      editorElement.addEventListener("keydown", stopPropagation);
      editorElement.addEventListener("keyup", stopPropagation);
      editorElement.addEventListener("keypress", stopPropagation);

      return () => {
        editorElement.removeEventListener("keydown", stopPropagation);
        editorElement.removeEventListener("keyup", stopPropagation);
        editorElement.removeEventListener("keypress", stopPropagation);
      };
    }
  }, [editorRef, editorValue, isVisible, onUpdate, saveDocument, selectedDocument]);

  useImperativeHandle(ref, () => ({
    setVisible: (visible: boolean) => {
      setIsVisible(visible);
      if (visible) {
        fetchDocumentList();
      }
    },
  }));

  const setup: BasicSetupOptions = {
    lineNumbers: true,
    highlightActiveLineGutter: true,
    allowMultipleSelections: true,
    closeBrackets: true,
    bracketMatching: true,
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={() => setIsHovered(true)}
      className={`${styles.editorContainer}  ${isVisible ? styles.visible : styles.hidden} ${isHovered ? styles.hovered : styles.notHovered}`}
    >
      <div className={styles.documentList}>
        <h4>Documents</h4>
        <ul>
          {documentList.map((docName) => (
            <li
              key={docName}
              className={selectedDocument === docName ? styles.selectedDocument : ""}
            >
              <span onClick={() => fetchDocumentContent(docName)}>{docName}</span>
              {documentsWithCopies.includes(docName) && (
                <button
                  onClick={() => restoreDocument(docName)}
                  title="Restore original"
                  className={styles.restoreButton}
                >
                  ⟳
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.editorWrapper} ref={editorRef}>
        <CodeMirror
          className={styles.editor}
          value={editorValue}
          basicSetup={setup}
          extensions={[
            html({
              matchClosingTags: true,
              autoCloseTags: true,
              extraTags: {
                "m-group": {},
                "m-cube": {},
                "m-sphere": {},
                "m-plane": {},
                "m-cylinder": {},
                "m-light": {},
                "m-attr-anim": {},
                "m-attr-lerp": {},
                "m-position-probe": {},
              },
            }),
          ]}
          theme={editorTheme}
          onChange={(val) => {
            setEditorValue(val); // Update the editor value as the user types
          }}
          autoFocus={true}
        />
      </div>
    </div>
  );
};

export default React.forwardRef(EditorPanelComponent);