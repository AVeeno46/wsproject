import argparse
from pathlib import Path

from processors.pipeline_manager import PipelineManager


def resolve_default_pdf() -> str:
    """Find a default PDF when the user does not pass a file path."""
    default_path = Path("samples/test.pdf")
    if default_path.exists():
        return str(default_path)

    sample_pdfs = sorted(Path("samples").glob("*.pdf"))
    if sample_pdfs:
        return str(sample_pdfs[0])

    return str(default_path)


def main():
    parser = argparse.ArgumentParser(description="Run local RAG ingestion pipeline.")
    parser.add_argument(
        "file_path",
        nargs="?",
        default=resolve_default_pdf(),
        help="PDF file path to ingest",
    )
    parser.add_argument(
        "--limit-chunks",
        type=int,
        default=None,
        help="Use only the first N chunks for preview or embedding",
    )
    parser.add_argument(
        "--text-only",
        action="store_true",
        help="Use text/table_text only; skip image/figure/chart and VLM recovery",
    )
    parser.add_argument(
        "--parse-only",
        action="store_true",
        help="Run parsing and page preview only; skip chunking, embedding, and Qdrant insert",
    )
    parser.add_argument(
        "--chunk-only",
        action="store_true",
        help="Run parsing/chunking previews only; skip embedding and Qdrant insert",
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help="After chunking, skip embedding and Qdrant insert",
    )
    parser.add_argument(
        "--embed",
        action="store_true",
        help="Explicitly run embedding and Qdrant insert after chunking",
    )
    parser.add_argument(
        "--allow-api",
        action="store_true",
        help="Allow paid document parsing API calls",
    )
    parser.add_argument(
        "--force-api",
        action="store_true",
        help="Force a new API parse even when parsed cache exists; requires --allow-api",
    )
    parser.add_argument(
        "--from-parsed",
        default=None,
        help="Load parsed elements from an existing JSONL file instead of calling the API",
    )
    parser.add_argument(
        "--reset-collection",
        action="store_true",
        help="Delete and recreate the Qdrant collection before inserting embedded chunks",
    )

    args = parser.parse_args()

    pipeline = PipelineManager()
    result = pipeline.run(
        args.file_path,
        limit_chunks=args.limit_chunks,
        text_only=args.text_only,
        parse_only=args.parse_only,
        chunk_only=args.chunk_only,
        no_embed=args.no_embed,
        embed=args.embed,
        allow_api=args.allow_api,
        force_api=args.force_api,
        from_parsed=args.from_parsed,
        reset_collection=args.reset_collection,
    )

    print("\n===== Pipeline result =====")
    print(result)


if __name__ == "__main__":
    main()
