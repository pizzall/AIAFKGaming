"""Build small Chinese-friendly JSON indexes without selecting a battle rules version."""

from collections import Counter, defaultdict
import csv
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw/pokeapi"


def read_table(name):
    with (RAW / f"{name}.csv").open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def convert(value):
    if value == "":
        return None
    return int(value) if re.fullmatch(r"-?\d+", value) else value


def typed(row):
    return {key: bool(int(value)) if key.startswith("is_") and value else convert(value) for key, value in row.items()}


def indexed(name):
    return {int(row["id"]): typed(row) for row in read_table(name)}


def grouped(name, key):
    groups = defaultdict(list)
    for row in read_table(name):
        groups[int(row[key])].append(typed(row))
    return groups


def localized(name, key):
    return {int(row[key]): row for row in read_table(name) if row["local_language_id"] == "12"}


def write_json(name, data):
    (DATA / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    manifest = json.loads((DATA / "download-manifest.json").read_text(encoding="utf-8"))
    paths = {entry["path"] for entry in manifest["files"]}
    image_dirs = {
        "artwork": "artwork", "artwork_female": "artwork/female", "front": "front", "back": "back",
        "front_shiny": "front/shiny", "back_shiny": "back/shiny", "front_female": "front/female",
        "back_female": "back/female", "front_shiny_female": "front/shiny/female", "back_shiny_female": "back/shiny/female",
    }

    def images(stem):
        candidates = {slot: f"assets/pokemon/{directory}/{stem}.png" for slot, directory in image_dirs.items()}
        return {slot: path if path in paths else None for slot, path in candidates.items()}

    species = indexed("pokemon_species")
    pokemon = indexed("pokemon")
    forms = indexed("pokemon_forms")
    species_names = localized("pokemon_species_names", "pokemon_species_id")
    form_names = localized("pokemon_form_names", "pokemon_form_id")
    egg_groups = grouped("pokemon_egg_groups", "species_id")
    evolutions = grouped("pokemon_evolution", "evolved_species_id")
    pokemon_types = grouped("pokemon_types", "pokemon_id")
    form_types = grouped("pokemon_form_types", "pokemon_form_id")
    pokemon_stats = grouped("pokemon_stats", "pokemon_id")
    pokemon_abilities = grouped("pokemon_abilities", "pokemon_id")
    types = indexed("types")
    type_names = localized("type_names", "type_id")
    abilities = indexed("abilities")
    ability_names = localized("ability_names", "ability_id")
    stats = indexed("stats")
    names = grouped("pokemon_species_names", "pokemon_species_id")
    languages = indexed("languages")
    descriptions = defaultdict(list)
    for row in read_table("pokemon_species_flavor_text"):
        if row["language_id"] == "12":
            descriptions[int(row["species_id"])].append({"version_id": int(row["version_id"]), "text": row["flavor_text"]})

    def describe_types(rows):
        return [{**row, "identifier": types[row["type_id"]]["identifier"],
                 "name_zh_hans": type_names.get(row["type_id"], {}).get("name")} for row in sorted(rows, key=lambda x: x["slot"])]

    for species_id, item in species.items():
        item["name_zh_hans"] = species_names.get(species_id, {}).get("name")
        item["genus_zh_hans"] = species_names.get(species_id, {}).get("genus")
        item["names"] = {languages[row["local_language_id"]]["identifier"]: row["name"] for row in names[species_id]}
        item["egg_group_ids"] = [row["egg_group_id"] for row in egg_groups[species_id]]
        item["flavor_text_zh_hans"] = descriptions[species_id]
        item["evolution_rules_as_target"] = evolutions[species_id]
        item["pokemon_ids"] = []

    for pokemon_id, item in pokemon.items():
        item["name_zh_hans"] = species[item["species_id"]]["name_zh_hans"]
        item["height_dm"] = item.pop("height")
        item["weight_hg"] = item.pop("weight")
        item["types"] = describe_types(pokemon_types[pokemon_id])
        item["base_stats"] = {stats[row["stat_id"]]["identifier"]: row["base_stat"] for row in pokemon_stats[pokemon_id]}
        item["effort_yield"] = {stats[row["stat_id"]]["identifier"]: row["effort"] for row in pokemon_stats[pokemon_id]}
        item["abilities"] = [
            {**row, "identifier": abilities[row["ability_id"]]["identifier"],
             "name_zh_hans": ability_names.get(row["ability_id"], {}).get("name")}
            for row in sorted(pokemon_abilities[pokemon_id], key=lambda x: x["slot"])
        ]
        item["images"] = images(str(pokemon_id))
        item["form_ids"] = []
        species[item["species_id"]]["pokemon_ids"].append(pokemon_id)

    for form_id, item in forms.items():
        parent = pokemon[item["pokemon_id"]]
        item["species_id"] = parent["species_id"]
        item["species_name_zh_hans"] = parent["name_zh_hans"]
        translated = form_names.get(form_id, {})
        item["form_name_zh_hans"] = translated.get("form_name") or None
        item["pokemon_name_zh_hans"] = translated.get("pokemon_name") or None
        item["types"] = describe_types(form_types[form_id]) if form_types[form_id] else parent["types"]
        stem = str(item["pokemon_id"]) if item["is_default"] else f"{item['pokemon_id']}-{item['form_identifier']}"
        item["images"] = images(stem)
        parent["form_ids"].append(form_id)

    missing = {}
    for kind, catalog in [("pokemon", pokemon), ("forms", forms)]:
        missing[kind] = {}
        for slot in ("artwork", "front", "back", "front_shiny", "back_shiny"):
            missing[kind][slot] = [
                {"id": item["id"], "identifier": item["identifier"], "species_id": item["species_id"]}
                for item in catalog.values() if item["images"][slot] is None
            ]
    default_pokemon = [item for item in pokemon.values() if item["is_default"]]
    summary = {
        "species": len(species), "pokemon": len(pokemon), "forms": len(forms),
        "raw_tables": len(list(RAW.glob("*.csv"))), "image_files": sum(path.endswith(".png") for path in paths),
        "species_with_chinese_name": sum(bool(item["name_zh_hans"]) for item in species.values()),
        "default_pokemon_missing_images": {
            slot: [item["id"] for item in default_pokemon if item["images"][slot] is None] for slot in ("artwork", "front", "back")
        },
        "missing_image_counts": {kind: {slot: len(rows) for slot, rows in values.items()} for kind, values in missing.items()},
        "image_counts_by_category": dict(Counter(entry["category"] for entry in manifest["files"] if entry["path"].endswith(".png"))),
    }
    report = {
        "sources": manifest["sources"], "summary": summary, "missing_images": missing,
        "forms_missing_chinese_label": [
            {"id": item["id"], "identifier": item["identifier"]}
            for item in forms.values() if item["form_identifier"] and not item["form_name_zh_hans"]
        ],
        "note": "Missing means absent at the exact upstream filename; no other form is substituted. Download integrity is separate.",
    }
    write_json("species.json", list(species.values()))
    write_json("pokemon.json", list(pokemon.values()))
    write_json("forms.json", list(forms.values()))
    write_json("coverage-report.json", report)
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
