use criterion::{black_box, criterion_group, criterion_main, Criterion};
use prost::Message;
use rusqlite::Connection;
use std::{fs, io::Write, path::Path, sync::OnceLock};
use story_forge_lib::modules::{
    maps::scan_maps, mods::get_mods_in_dir, proto::GameData, saves::scan_saves,
};
use tempfile::TempDir;

fn maps_fixture() -> &'static TempDir {
    static FIXTURE: OnceLock<TempDir> = OnceLock::new();
    FIXTURE.get_or_init(|| {
        let tmp = TempDir::new().unwrap();
        for i in 0..20 {
            let inst = tmp.path().join(format!("installation_{}", i));
            let maps_dir = inst.join("Maps");
            fs::create_dir_all(&maps_dir).unwrap();
            for j in 0..10 {
                fs::write(maps_dir.join(format!("map_{}.db", j)), []).unwrap();
            }
        }
        tmp
    })
}

fn mods_fixture() -> &'static TempDir {
    static FIXTURE: OnceLock<TempDir> = OnceLock::new();
    FIXTURE.get_or_init(|| {
        let tmp = TempDir::new().unwrap();
        let mods_dir = tmp.path().join("Mods");
        fs::create_dir_all(&mods_dir).unwrap();

        let modinfo = r#"{
            "modid": "testmod",
            "name": "Test Mod",
            "authors": ["author"],
            "version": "1.0.0"
        }"#;

        for i in 0..50 {
            let path = mods_dir.join(format!("mod_{}.zip", i));
            let file = fs::File::create(&path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("modinfo.json", options).unwrap();
            zip.write_all(modinfo.as_bytes()).unwrap();
            zip.finish().unwrap();
        }
        tmp
    })
}

fn create_vcdbs(path: &Path, identifier: &str) {
    let conn = Connection::open(path).unwrap();
    conn.execute("CREATE TABLE gamedata (data BLOB)", [])
        .unwrap();

    let gamedata = GameData {
        world_name: "Benchmark World".into(),
        savegame_identifier: identifier.into(),
        ..Default::default()
    };
    let mut buf = Vec::new();
    gamedata.encode(&mut buf).unwrap();
    conn.execute("INSERT INTO gamedata (data) VALUES (?1)", [&buf])
        .unwrap();
}

fn saves_fixture() -> &'static TempDir {
    static FIXTURE: OnceLock<TempDir> = OnceLock::new();
    FIXTURE.get_or_init(|| {
        let tmp = TempDir::new().unwrap();
        for i in 0..20 {
            let inst = tmp.path().join(format!("installation_{}", i));
            let saves_dir = inst.join("Saves");
            fs::create_dir_all(&saves_dir).unwrap();
            for j in 0..5 {
                create_vcdbs(
                    &saves_dir.join(format!("save_{}.vcdbs", j)),
                    &format!("inst{}_save{}", i, j),
                );
            }
        }
        tmp
    })
}

fn bench_scan_maps(c: &mut Criterion) {
    let fixture = maps_fixture();
    c.bench_function("scan_maps 20x10", |b| {
        b.iter(|| {
            black_box(scan_maps(black_box(fixture.path())).unwrap());
        })
    });
}

fn bench_get_mods(c: &mut Criterion) {
    let fixture = mods_fixture();
    c.bench_function("get_mods_in_dir 50 zips", |b| {
        b.iter(|| {
            black_box(get_mods_in_dir(black_box(&fixture.path().join("Mods"))).unwrap());
        })
    });
}

fn bench_scan_saves(c: &mut Criterion) {
    let fixture = saves_fixture();
    c.bench_function("scan_saves 20x5 vcdbs", |b| {
        b.iter(|| {
            black_box(scan_saves(black_box(fixture.path())).unwrap());
        })
    });
}

criterion_group!(benches, bench_scan_maps, bench_get_mods, bench_scan_saves);
criterion_main!(benches);
