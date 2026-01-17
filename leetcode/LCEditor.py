class Solution:
    def fourSum(self, nums: List[int], target: int) -> List[List[int]]:
        res = []
        nums.sort()

        for i, a in enumerate(nums):
            if i > 0 and a == nums[i - 1]:
                continue
            for j in range(i + 1, len(nums)):
                if j > i + 1 and nums[j] == nums[j - 1]:
                    continue
                l, r = j + 1, len(nums) - 1
                while l < r:
                    fourSum = a + nums[j] + nums[l] + nums[r]

                    if fourSum < target:
                        l += 1
                    elif fourSum > target:
                        r -= 1

                    
        return res

#new things from nvim

