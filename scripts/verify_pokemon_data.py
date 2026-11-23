"""Check the generated catalog against the pinned raw tables and local image files."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def table(name):
    with (ROOT / "data/raw/pokeapi" / f"{name}.csv").open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def main():
    species = {row["id"]: row for row in load("species.json")}
    pokemon = {row["id"]: row for row in load("pokemon.json")}
    forms = {row["id"]: row for row in load("forms.json")}
    for name, catalog in [("pokemon_species", species), ("pokemon", pokemon), ("pokemon_forms", forms)]:
        expected = {int(row["id"]) for row in table(name)}
        if set(catalog) != expected:
            raise ValueError(f"{name}: missing or extra IDs")
    for row in table("pokemon_species_names"):
        if row["local_language_id"] == "12":
            assert species[int(row["pokemon_species_id"])]["name_zh_hans"] == row["name"]
    for row in table("pokemon"):
        item = pokemon[int(row["id"])]
        assert item["species_id"] == int(row["species_id"])
        assert item["height_dm"] == int(row["height"]) and item["weight_hg"] == int(row["weight"])
        assert len(item["base_stats"]) == 6
        assert item["species_id"] in species
    stats = {int(row["id"]): row["identifier"] for row in table("stats")}
    for row in table("pokemon_stats"):
        item = pokemon[int(row["pokemon_id"])]
        assert item["base_stats"][stats[int(row["stat_id"])]] == int(row["base_stat"])
    for row in table("pokemon_forms"):
        item = forms[int(row["id"])]
        assert item["pokemon_id"] == int(row["pokemon_id"])
        assert item["id"] in pokemon[item["pokemon_id"]]["form_ids"]
        assert item["species_id"] == pokemon[item["pokemon_id"]]["species_id"]

    # Form ID 10001 is Unown B; Pokemon ID 10001 is Deoxys Attack. They must never share an image by numeric ID.
    assert forms[10001]["identifier"] == "unown-b"
    assert forms[10001]["images"]["front"] == "assets/pokemon/front/201-b.png"
    assert pokemon[10001]["identifier"] == "deoxys-attack"
    assert pokemon[10001]["images"]["front"] == "assets/pokemon/front/10001.png"
    assert pokemon[25]["name_zh_hans"] == "皮卡丘"
    assert pokemon[1025]["name_zh_hans"] == "桃歹郎"
    manifest = {entry["path"] for entry in load("download-manifest.json")["files"]}
    image_references = 0
    for item in list(pokemon.values()) + list(forms.values()):
        for path in item["images"].values():
            if path is not None:
                assert path in manifest and (ROOT / path).is_file(), path
                image_references += 1
    report = load("coverage-report.json")
    for kind, catalog in [("pokemon", pokemon), ("forms", forms)]:
        for slot in ("artwork", "front", "back", "front_shiny", "back_shiny"):
            expected = {item["id"] for item in catalog.values() if item["images"][slot] is None}
            actual = {item["id"] for item in report["missing_images"][kind][slot]}
            assert actual == expected, (kind, slot)
    print(f"Verified {len(species)} species, {len(pokemon)} Pokemon, {len(forms)} forms, {image_references} image references")


if __name__ == "__main__":
    main()
