import argparse

from retrievers.retriever import QdrantRetriever


def print_results(results: list) -> None:
    if not results:
        print("\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.")
        return

    print(f"\n{'=' * 15} [ \uac80\uc0c9 \uacb0\uacfc ] {'=' * 15}")
    for i, res in enumerate(results):
        score = res["score"]
        payload = res["payload"]

        print(f"\n\U0001f947 [{i + 1}\uc704] \uc720\uc0ac\ub3c4: {score:.4f}")
        print(f"- source_file: {payload.get('source_file')}")
        print(f"- page: {payload.get('page')}")
        print(f"- type: {payload.get('type')}")
        print(f"- section_title: {payload.get('section_title')}")
        print(f"- parent_chunk_id: {payload.get('parent_chunk_id')}")
        print(f"- element_indexes: {payload.get('element_indexes')}")
        print("\n\ub0b4\uc6a9:")
        print(payload.get("content"))
        print("-" * 60)


def run_search(retriever: QdrantRetriever, query: str, top_k: int) -> None:
    results = retriever.retrieve(query, top_k=top_k)
    print_results(results)


def interactive_loop(retriever: QdrantRetriever, top_k: int) -> None:
    print("\uc9c8\ubb38\uc744 \uc785\ub825\ud558\uc138\uc694 (\uc885\ub8cc: q, quit, exit):")

    while True:
        query = input("> ").strip()
        if query.lower() in {"q", "quit", "exit"}:
            print("\uac80\uc0c9\uc744 \uc885\ub8cc\ud569\ub2c8\ub2e4.")
            return
        if not query:
            print("\ube48 \uc9c8\ubb38\uc785\ub2c8\ub2e4. \ub2e4\uc2dc \uc785\ub825\ud574 \uc8fc\uc138\uc694.")
            continue

        run_search(retriever, query, top_k)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Qdrant RAG search test")
    parser.add_argument(
        "query",
        nargs="?",
        help=(
            "\uac80\uc0c9\ud560 \uc9c8\ubb38. "
            "\uc0dd\ub7b5\ud558\uba74 \ub300\ud654\ud615 "
            "\uc785\ub825 \ubaa8\ub4dc\ub85c \uc2e4\ud589\ub429\ub2c8\ub2e4."
        ),
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="\uac80\uc0c9 \uacb0\uacfc \uac1c\uc218",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    retriever = QdrantRetriever()

    print("\U0001f680 [RAG \uac80\uc0c9 \ud14c\uc2a4\ud2b8\ub97c \uc2dc\uc791\ud569\ub2c8\ub2e4...]")

    if args.query:
        query = args.query.strip()
        if not query:
            print("\ube48 \uc9c8\ubb38\uc785\ub2c8\ub2e4. \ub2e4\uc2dc \uc785\ub825\ud574 \uc8fc\uc138\uc694.")
            return
        run_search(retriever, query, args.top_k)
    else:
        interactive_loop(retriever, args.top_k)


if __name__ == "__main__":
    main()
