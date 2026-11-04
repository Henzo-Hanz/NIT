from django.db import migrations

# Índice full-text (SQLite FTS5) sobre biodiversidade_especie como content
# table externa. O tokenizer padrão (unicode61) já normaliza caixa e remove
# acentos (verificado no SQLite 3.51.2 do projeto: 'uca*' encontra
# 'Caranguejo-uçá'), então nomes com acento/ponto/ponto-code são tratados
# pelo índice. Os triggers abaixo mantêm o FTS sincronizado com INSERT /
# DELETE / UPDATE (UPDATE OF nas colunas indexadas); o 'rebuild' inicial
# indexa as linhas já existentes (inclusive as dados do seed_demo).

SQL_CRIAR = [
    """
    CREATE VIRTUAL TABLE biodiversidade_especies_fts USING fts5(
        nome_popular,
        nome_cientifico,
        content='biodiversidade_especie',
        content_rowid='id'
    )
    """,
    """
    CREATE TRIGGER biodiversidade_especies_fts_ai AFTER INSERT ON biodiversidade_especie BEGIN
        INSERT INTO biodiversidade_especies_fts (rowid, nome_popular, nome_cientifico)
        VALUES (new.id, new.nome_popular, new.nome_cientifico);
    END
    """,
    """
    CREATE TRIGGER biodiversidade_especies_fts_ad AFTER DELETE ON biodiversidade_especie BEGIN
        INSERT INTO biodiversidade_especies_fts (biodiversidade_especies_fts, rowid, nome_popular, nome_cientifico)
        VALUES ('delete', old.id, old.nome_popular, old.nome_cientifico);
    END
    """,
    """
    CREATE TRIGGER biodiversidade_especies_fts_au AFTER UPDATE OF nome_popular, nome_cientifico ON biodiversidade_especie BEGIN
        INSERT INTO biodiversidade_especies_fts (biodiversidade_especies_fts, rowid, nome_popular, nome_cientifico)
        VALUES ('delete', old.id, old.nome_popular, old.nome_cientifico);
        INSERT INTO biodiversidade_especies_fts (rowid, nome_popular, nome_cientifico)
        VALUES (new.id, new.nome_popular, new.nome_cientifico);
    END
    """,
    "INSERT INTO biodiversidade_especies_fts(biodiversidade_especies_fts) VALUES('rebuild')",
]

SQL_REMOVER = [
    "DROP TRIGGER IF EXISTS biodiversidade_especies_fts_au",
    "DROP TRIGGER IF EXISTS biodiversidade_especies_fts_ad",
    "DROP TRIGGER IF EXISTS biodiversidade_especies_fts_ai",
    "DROP TABLE IF EXISTS biodiversidade_especies_fts",
]


class Migration(migrations.Migration):

    dependencies = [
        ('biodiversidade', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(sql=SQL_CRIAR, reverse_sql=SQL_REMOVER),
    ]
