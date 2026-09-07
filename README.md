# OfferFlow｜从投递到 Offer，让每一次投递都有迹可循

一个基于 Next.js App Router、TypeScript、Ant Design、Prisma 和 MySQL 8 的个人秋招投递管理 Dashboard。

## 功能

- 邮箱、用户名、密码注册；bcrypt 安全哈希；Credentials 登录、退出和 JWT 会话保持。
- 投递记录的新增、编辑、删除、链接打开、搜索、状态筛选、需关注筛选、分页和排序。
- 公司、投递链接、投递日期、三个志愿职位、状态、备注和最后动态时间。
- 状态变更历史和普通动态时间线；状态/动态写入与最后动态时间更新都在事务内完成。
- 按自然日计算无动态天数：7–13 天黄色提醒，14 天及以上红色提醒；Offer、被拒、流程结束不提醒。
- Dashboard 统计和“需要关注”队列只读取当前登录用户的数据。
- 使用 Ant Design Table、Form、Modal、Drawer、Tag、Statistic 和 ConfigProvider；表单校验使用 Zod。

## 本地启动

环境要求：Node.js 20.19+（推荐 22.13+）、Docker Desktop。

```bash
npm install
copy .env.example .env       # macOS/Linux 使用 cp .env.example .env
docker compose up -d mysql
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Compose 会通过 `docker/mysql/init.sql` 同时创建迁移所需的 `qiu_zhao_tracker_shadow` 库。若之前已经创建过同名 Docker volume，初始化脚本不会重复执行；可手动创建该库并授权，或在确认无需保留旧数据后再重建 volume。

打开 http://localhost:3000。

## 生产 Docker 部署

项目提供 `Dockerfile` 和 `docker-compose.prod.yml`。生产 Compose 只启动 Next.js 应用，不会创建新的 MySQL；应用通过名为 `qiu-zhao-network` 的外部 Docker 网络连接服务器上已有的 MySQL 容器。

首次部署前，在服务器上确认 MySQL 容器名称，并将它加入应用网络：

```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
docker network create qiu-zhao-network
docker network connect qiu-zhao-network <现有MySQL容器名>
```

将 `.env.production` 放在项目根目录，数据库主机使用 MySQL 容器名，不要使用 `localhost`：

```dotenv
DATABASE_URL="mysql://数据库用户:数据库密码@现有MySQL容器名:3306/qiu_zhao_tracker"
NEXTAUTH_URL="https://你的域名"
NEXTAUTH_SECRET="长度足够的随机字符串"
```

确保数据库和账号已经在现有 MySQL 中创建，然后构建并启动应用：

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

容器启动时会自动执行 `prisma migrate deploy`，然后启动 Next.js。更新代码后重复执行 `up -d --build` 即可；不要在生产环境使用 `prisma migrate dev` 或执行演示数据 seed。

本项目不依赖 seed 才能运行，启动流程不会自动创建或覆盖任何账号、投递或历史记录。

如确实需要演示数据，必须显式设置 `ALLOW_DEMO_SEED=true`，并使用一个数据库中尚不存在的 `SEED_EMAIL`。seed 只会创建一个全新的演示账号和 3 条演示投递；如果目标邮箱已存在，脚本会直接终止，不会修改已有数据。

## 验证命令

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

集成测试需要 MySQL 已启动并且已完成迁移。测试会创建带时间戳的临时用户，结束后自动删除。

## 主要文件结构

```text
src/
  app/
    (auth)/login, register/       登录注册页
    (app)/dashboard/              受保护的 Dashboard
    api/auth, register/           Auth.js 与注册接口
    api/applications/             投递、详情、动态 API
    api/dashboard/                统计 API
  components/
    auth/                         登录注册表单
    applications/                 投递表单、详情 Drawer、状态 Tag
    dashboard/                    列表与统计交互
  lib/
    auth.ts                       Auth.js 配置与服务端会话
    application-service.ts        带用户隔离的投递领域服务
    validations.ts                前后端共用 Zod 校验
    date.ts                       无动态天数与提醒规则
prisma/schema.prisma              User / JobApplication / Position / Event
prisma/seed.ts                    示例用户与投递数据
docker-compose.yml                MySQL 8.4
```

## 数据模型

- `User`：账号和 bcrypt `passwordHash`；邮箱唯一。
- `JobApplication`：当前状态、投递日期、最后动态时间、备注和所属用户。
- `ApplicationPosition`：职位名称与 1/2/3 志愿优先级；同一投递的优先级唯一。
- `ApplicationEvent`：状态变更或普通动态，记录原状态、新状态、说明和发生时间。

`JobApplication` 上包含 `userId + currentStatus`、`userId + appliedAt`、`userId + lastActivityAt` 复合索引。

## 用户隔离

所有 API 先通过 `requireUser()` 获取 Auth.js Session 中的 `session.user.id`，服务层的查询、更新、删除和事件写入都同时带 `id + userId` 条件。请求体不会接收或信任 `userId`。跨用户资源统一返回 404；统计、列表和详情也只使用当前 Session 用户。API 返回 DTO 不包含 `passwordHash`。

## 当前限制

- 当前使用 Credentials 登录，没有接入第三方 OAuth。
- 生产环境需要将 `NEXTAUTH_SECRET` 换成高强度随机值，并使用正式 MySQL、HTTPS 和密钥管理。
- 列表搜索目前按公司名称搜索，不包含职位或备注全文搜索。
- 自动化测试覆盖核心领域服务和数据隔离；浏览器级 E2E 需要另接 Playwright 等浏览器测试运行器。
