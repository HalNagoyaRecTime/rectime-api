# ARCHITECTURE.md — rectime-api

## 概要

`rectime-api`はPresentation、Application、Domain、Infrastructureの4層で責務を分ける。

## 4層と依存方向

```text
Presentation → Application / Domain
Presentation Middleware → DI
Application → Domain
Infrastructure → Application / Domain
DI → Application / Infrastructure
```

- Domainは他の層に依存しない。
- PresentationはApplicationとDomainを利用できる。
- PresentationのDI Middlewareだけは、DIコンテナをContextへ注入するためDIを利用できる。
- ApplicationはDomainを利用できる。
- InfrastructureはApplicationとDomainの契約を実装する。
- DIで契約と実装を組み合わせる。

## 配置

| Path                                  | 配置するもの                         |
| ------------------------------------- | ------------------------------------ |
| `src/index.ts`                        | Routeとentry point                   |
| `src/presentation/controllers/`       | HTTP入力とレスポンス変換             |
| `src/presentation/middleware/`        | Hono middleware                      |
| `src/application/services/`           | Application Service                  |
| `src/application/ports/`              | 外部サービスの契約                   |
| `src/application/dto/`                | HTTPのrequest、query、responseの契約 |
| `src/domain/entities/`                | Domain Entity                        |
| `src/domain/interfaces/repositories/` | Repositoryの契約                     |
| `src/domain/errors/`                  | Domain Error                         |
| `src/infrastructure/repositories/`    | Repositoryの実装                     |
| `src/infrastructure/adapters/`        | Portの実装                           |
| `src/infrastructure/database/`        | Drizzle schema                       |
| `src/di/container.ts`                 | 依存関係の組み立て                   |
| `src/lib/`                            | DBや環境変数の共通処理               |
| `src/types/`                          | Bindingなどの共通型                  |
| `migrations/`                         | D1 migration                         |
| `test/`                               | Testとfixture                        |

## 型の境界

- HTTPのrequest body、query、responseの契約は`src/application/dto/`に置く。
- 検証後のHTTP入力はRequest DTOとしてApplication Serviceへ渡す。
- Application ServiceはDTOとDomain型を変換する。
- Domain modelとRepositoryの入力、検索条件、戻り値は`src/domain/`に置く。
- RepositoryはDTOを受け取らない。
- IDなどの単純な値や内部処理だけで使う型はDTOにしない。
- DTOは`CreateEventRequestDTO`、`UpdateEventRequestDTO`、`EventDTO`、`EventListResponseDTO`のように役割を名前で示す。

## 共通ルール

- 必要なdirectoryだけ作る。
- 1fileに1つの責務を持たせる。
- 循環依存を作らない。

## 各層のルール

### Presentation

- ControllerはHTTP入力の取得と検証、HTTPレスポンスへの変換を行う。
- MiddlewareはHTTPに共通する処理だけを持つ。
- 業務ルール、DB操作、外部サービスの処理は書かない。

### Application

- Application Serviceはユースケースを実行する。
- 外部サービスはPortの契約を介して利用する。
- Hono、D1、外部SDKに依存しない。

### Domain

- Entity、Repositoryの契約と入出力型、Domain Errorを置く。
- 業務ルールはFrameworkに依存させない。
- HTTP、DB schema、外部サービスの形式を持ち込まない。

### Infrastructure

- RepositoryはD1の操作とDB rowからEntityへの変換を行う。
- AdapterはPortを外部サービスへ接続する。
- Drizzle schemaは`src/infrastructure/database/schema.ts`に置く。
- Schema変更時は`migrations/`に新しいSQL fileを追加する。
- 適用済みのmigrationは変更しない。
- HTTPの入力処理と業務ルールは書かない。
