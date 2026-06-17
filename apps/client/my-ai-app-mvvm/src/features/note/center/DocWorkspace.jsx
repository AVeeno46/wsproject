import { DocViewer } from "./DocViewer";
import { FileDropzone } from "./FileDropzone";

export function DocWorkspace({ activeSource, onDrop, isDragging }) {
  return (
    <section className="documentPanel">
      {activeSource ? (
        <DocViewer source={activeSource} />
      ) : (
        <FileDropzone onDrop={onDrop} isDragging={isDragging} />
      )}
    </section>
  );
}
