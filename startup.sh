#!/bin/bash
npm run build
npm start
```

---

**Your three-branch deployment setup will then be:**
```
dev    → push here for testing  → Vercel preview URL
main   → merge from dev         → Vercel production URL  
azure  → merge from main        → Azure App Service URL
