import sys, json, urllib.request
head = sys.argv[1]
d = json.load(urllib.request.urlopen("https://api.github.com/repos/kfaeghi-hub/isothermAPP/deployments?per_page=5"))
for dep in d:
    if dep['sha'] == head:
        st = json.load(urllib.request.urlopen(f"https://api.github.com/repos/kfaeghi-hub/isothermAPP/deployments/{dep['id']}/statuses"))
        s = st[0]['state'] if st else 'pending'
        print(head[:8], s); sys.exit(0 if s in ('success','failure','error') else 1)
print('pending'); sys.exit(1)
