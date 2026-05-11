# FamilyBase - Gamified Family Management API

FamilyBase is a full-stack SaaS platform designed to help families manage tasks, finances (allowance/mesada), education (grades), and schedules through a gamified and organized interface. 

The project is divided into two main parts: the **Frontend** (React + Vite) and the **Backend** (Node.js + Express).

## 🚀 Features & Modules (Backend)

The backend provides a robust RESTful API with the following core modules:

*   **Auth Module (`/auth`)**: Handles user authentication, registration, login, and JWT token management.
*   **Families Module (`/families`)**: Manages family units, allowing parents to add children and relatives to their family group.
*   **Tasks Module (`/tasks`)**: Manages daily and occasional tasks. Supports occurrence-based instances and gamified rewards.
*   **Grades Module (`/grades`)**: Tracks academic performance and school grades of the children.
*   **Allowance Module (`/allowance`)**: Financial management (Mesada) for children, tracking earnings, bonuses, penalties, and current balance.
*   **Calendar Module (`/calendar`)**: Manages family events, schedules, and important dates.
*   **Gamification Module (`/gamification`)**: Handles points, levels, and achievements to keep children engaged.
*   **Reports Module (`/reports`)**: Generates analytics and performance reports for parents regarding task completion and academic progress.
*   **Notifications Module (`/notifications`)**: Manages real-time alerts and messages between family members.
*   **Permissions Module (`/permissions`)**: Role-Based Access Control (RBAC) to ensure security and proper access levels.
*   **Master Module (`/master`)**: Super-admin features for platform administration and oversight.

## 💻 Pages & Features (Frontend)

The frontend is a responsive, modern web application built with React. It features a role-based routing system with different views tailored for each user type:

### 👨‍👩‍👧 Parent & Relative Portal
*   **Dashboard**: Overview of family activities, pending tasks, and recent notifications.
*   **Task Manager**: Create, assign, and approve tasks for children.
*   **Grade Tracker**: Input and monitor academic grades.
*   **Allowance Manager**: Add funds, deduct penalties, and manage the financial allowance of children.
*   **Family Calendar**: Manage shared family events.
*   **Reports**: View detailed analytics on children's performance and behavior.
*   **Family & Admin**: Manage family members, profiles, and platform settings.

### 👦 Child Portal
*   **Child Dashboard**: A gamified, engaging overview of current standing, points, and level.
*   **My Tasks**: View and complete assigned daily/weekly tasks to earn points.
*   **My Grades**: Check academic progress and school results.
*   **My Allowance**: View current financial balance and transaction history.
*   **My Calendar**: See personal and family scheduled events.

### 👑 Master Admin Portal
*   **Master Dashboard**: Global platform statistics, tenant management, and system-wide configurations.

## 🛠️ Technology Stack

*   **Frontend**: React 19, Vite, React Router DOM, Context API.
*   **Backend**: Node.js, Express, SQLite (better-sqlite3), JWT, Bcrypt.

## ⚙️ How to Run

1.  **Backend**:
    ```bash
    cd backend
    npm install
    npm run dev
    ```
2.  **Frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
