#!/usr/bin/env python3
import logging
import re
from datetime import date
from html.parser import HTMLParser
from http import HTTPStatus
from pathlib import Path
from time import perf_counter

import httpx
import mistune
from jinja2 import Environment as JinjaEnv
from jinja2 import FileSystemLoader, StrictUndefined
from minicli import cli, run, wrap

from typographie import typographie

LOGGER = logging.getLogger(__name__)

HERE = Path(__file__).parent
SRC_DIR = HERE / "src"
CONTENUS_DIR = HERE / "contenus"
STATIC_DIR = HERE / "static"
TEMPLATES_DIR = HERE / "templates"

jinja_env = JinjaEnv(
    loader=FileSystemLoader(str(TEMPLATES_DIR)), undefined=StrictUndefined
)


class FrenchTypographyMixin:
    def text(self, text_):
        return typographie(super().text(text_))

    def block_html(self, html):
        return typographie(super().block_html(html))


class CSSMixin:
    """Possibilité d’ajouter une classe CSS sur une ligne de liste.

    Par exemple :

    * {.maClasse} item classique de la liste en markdown
    """

    RE_CLASS = re.compile(
        r"""^
            (?P<before>.*?)
            (?:\s*\{\.(?P<class>[\w\-]+?)\}\s*)
            (?P<after>.*)
            $
        """,
        re.MULTILINE | re.VERBOSE,
    )

    def list_item(self, text, level):
        mo = self.RE_CLASS.match(text)
        if mo is not None:
            class_ = mo.group("class")
            text = " ".join(filter(None, [mo.group("before"), mo.group("after")]))
            return f'<li class="{class_}">{text}</li>\n'
        return super().list_item(text, level)


class CustomHTMLRenderer(FrenchTypographyMixin, CSSMixin, mistune.HTMLRenderer):
    pass


markdown = mistune.create_markdown(
    escape=False,
    renderer=CustomHTMLRenderer(escape=False),
)


@cli
def all():
    index()
    thematiques()
    sitemap()
    readmes()


@cli
def index():
    """Build the index with contents from markdown dedicated folder."""
    responses = build_responses(CONTENUS_DIR)
    content = render_template("index.html", **responses)
    content = cache_external_pdfs(content)
    (SRC_DIR / "index.html").write_text(content)


@cli
def thematiques():
    """Build the pages with contents from markdown dedicated folder."""
    responses = build_responses(CONTENUS_DIR)
    for path in each_file_from(
        CONTENUS_DIR / "pages", exclude=("README.md", ".DS_Store")
    ):
        html_content = render_markdown_file(path)
        title = extract_title(html_content)
        content = render_template(
            "thematique.html",
            **{
                "title": title,
                "content": html_content,
                "meta_pied_de_page": responses["meta_pied_de_page"],
            },
        )
        (SRC_DIR / f"{path.stem}.html").write_text(content)


@cli
def sitemap():
    """Build the sitemap for index + themes pages."""
    stems = [
        path.stem
        for path in each_file_from(
            CONTENUS_DIR / "pages", exclude=("README.md", ".DS_Store")
        )
    ]
    content = render_template(
        "sitemap.html", page_names=stems, lastmod_date=date.today()
    )
    (STATIC_DIR / "sitemap.xml").write_text(content)


def extract_title(html_content):
    html_title, _ = html_content.split("</h1>", 1)
    return html_title.split("<h1>", 1)[1]


def build_responses(source_dir):
    """Extract and convert markdown from a `source_dir` directory into a dict."""
    responses = {}
    for folder in each_folder_from(source_dir):
        for path in each_file_from(folder, pattern="*.md"):
            html_content = render_markdown_file(path)
            responses[path.stem] = html_content

    return responses


def render_markdown_file(file_path):
    html_content = markdown.read(file_path)
    # Remove empty comments set to hack markdown rendering
    # when we do not want paragraphs.
    return html_content.replace("<!---->", "")


def _each_path_from(source_dir, pattern="*", exclude=None):
    for path in sorted(Path(source_dir).glob(pattern)):
        if exclude is not None and path.name in exclude:
            continue
        yield path


def each_folder_from(source_dir, exclude=None):
    """Walk across the `source_dir` and return the folder paths."""
    for path in _each_path_from(source_dir, exclude=exclude):
        if path.is_dir():
            yield path


def each_file_from(source_dir, pattern="*", exclude=None):
    """Walk across the `source_dir` and return the md file paths."""
    for path in _each_path_from(source_dir, pattern=pattern, exclude=exclude):
        if path.is_file():
            yield path


def render_template(src, **context):
    jinja_env.filters["me_or_them"] = me_or_them
    template = jinja_env.get_template(src)
    return template.render(**context)


def me_or_them(value):
    separator = "<hr />"
    if separator in value:
        me, them = (part.strip() for part in value.split(separator))
        value = f'<span class="me visible">{me}</span><span class="them" hidden>{them}</span>'
    return value


def cache_external_pdfs(content: str, timeout: int = 10) -> str:
    """
    Download external PDFs and replace links with the local copy
    """
    for url in _extract_pdf_links(content):
        filename = url_to_filename(url)
        download_file_if_needed(
            url=url,
            local_path=SRC_DIR / "pdfs" / filename,
            timeout=timeout,
        )
        content = content.replace(url, f"pdfs/{filename}")
    return content


def _extract_pdf_links(content):
    parser = PDFLinkExtractor()
    parser.feed(content)
    return sorted(parser.pdf_links)


class PDFLinkExtractor(HTMLParser):
    def reset(self):
        HTMLParser.reset(self)
        self.pdf_links = set()

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs = dict(attrs)
            url = attrs["href"]
            if url.startswith("http") and url.endswith(".pdf"):
                self.pdf_links.add(url)


def url_to_filename(url: str) -> str:
    basename, extension = url.rsplit(".", 1)
    filename = (
        basename.replace("http://", "")
        .replace("https://", "")
        .replace(".", "-")
        .replace("/", "-")
    )
    return f"{filename}.{extension}"


def download_file_if_needed(url, local_path, timeout):
    if local_path.exists():
        LOGGER.info(f"SKIP: {url} exists in {local_path}")
    else:
        LOGGER.info(f"FETCH: {url} to {local_path}")
        _download_file(url, local_path, timeout)


def _download_file(url, local_path, timeout):
    with httpx.stream(
        "GET",
        url,
        timeout=timeout,
        verify=False,  # ignore SSL certificate validation errors
    ) as response:
        if response.status_code != HTTPStatus.OK:
            raise Exception(f"{url} is broken! ({response.status_code})")
        _save_binary_response(local_path, response)


def _save_binary_response(file_path: Path, response: "httpx.Response"):
    if not file_path.parent.exists():
        file_path.parent.mkdir(parents=True)
    with open(file_path, "wb") as download_file:
        for chunk in response.iter_bytes():
            download_file.write(chunk)


@cli
def readmes():
    """Build the readmes with all content from markdown files in it."""
    for folder in each_folder_from(CONTENUS_DIR):
        folder_content = f"""
# {folder.name.title()}

*Ce fichier est généré automatiquement pour pouvoir accéder rapidement aux contenus,\
il ne doit pas être édité !*

"""
        for path in each_file_from(folder, exclude=("README.md", ".DS_Store")):
            file_content = path.read_text()
            folder_content += f"""
## [{path.name}]({path.name})

{file_content}

"""
        (folder / "README.md").open("w").write(folder_content)


@wrap
def perf_wrapper():
    start = perf_counter()
    yield
    elapsed = perf_counter() - start
    print(f"Done in {elapsed:.5f} seconds.")


if __name__ == "__main__":
    run()
